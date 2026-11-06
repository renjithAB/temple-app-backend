import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { BookingStatus, Prisma } from '../../generated/prisma/index.js';
import { APP_CONSTANTS } from '../../config/constants.js';
import { generateBookingCode } from '../../lib/codes.js';
import { generateQrPayload, verifyQrPayload } from '../../lib/qr.js';
import { BookingStateService } from './bookingState.service.js';
import {
  parsePagination,
  decodeCursor,
  buildPaginatedResponse,
} from '../../lib/pagination.js';
import { generateCsv } from '../../lib/csv.js';
import { pushService } from '../../integrations/push/index.js';
import { logger } from '../../lib/logger.js';

export class BookingsService {
  static async createBooking(
    userId: string,
    data: {
      poojaId: string;
      scheduleId: string;
      bookingDate: string;
      devotees: { name: string; nakshatra?: string | null; gotra?: string | null }[];
      occasionId?: string | null;
      note?: string | null;
    },
    idempotencyKey?: string
  ) {
    // 1. Idempotency Check (Double tap / flaky network protection)
    if (idempotencyKey) {
      const existing = await prisma.booking.findFirst({
        where: { userId, idempotencyKey },
        include: {
          devotees: true,
          pooja: { select: { name: true, nameMl: true } },
          temple: { select: { name: true, slug: true } },
        },
      });
      if (existing) {
        return {
          ...existing,
          qrPayload: generateQrPayload(existing.id, existing.templeId),
        };
      }
    }

    // 2. Validate Pooja & Schedule
    const pooja = await prisma.pooja.findUnique({
      where: { id: data.poojaId },
      include: { temple: true },
    });

    if (!pooja || !pooja.isActive || pooja.deletedAt) {
      throw AppError.notFound('Pooja is not available for booking');
    }

    if (!pooja.requiresBooking) {
      throw AppError.badRequest('This pooja is informational and does not require advance booking');
    }

    const schedule = await prisma.poojaSchedule.findUnique({
      where: { id: data.scheduleId },
    });

    if (!schedule || !schedule.isActive || schedule.poojaId !== pooja.id) {
      throw AppError.badRequest('Invalid pooja schedule');
    }

    // 3. Date & Devotee count validation
    const slotDate = new Date(`${data.bookingDate}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (slotDate < today) {
      throw AppError.badRequest('Cannot book poojas for past dates');
    }

    const maxAdvance = new Date(today);
    maxAdvance.setDate(today.getDate() + pooja.temple.bookingAdvanceDays);
    if (slotDate > maxAdvance) {
      throw AppError.badRequest(
        `Booking is only permitted up to ${pooja.temple.bookingAdvanceDays} days in advance`
      );
    }

    const devoteeCount = data.devotees.length;
    if (devoteeCount < 1 || devoteeCount > pooja.maxDevoteesPerBooking) {
      throw AppError.badRequest(
        `Number of devotees must be between 1 and ${pooja.maxDevoteesPerBooking}`
      );
    }

    // 4. Abuse Prevention (Section 7.5: max 10 active, max 20 per day)
    const activeCount = await prisma.booking.count({
      where: { userId, status: BookingStatus.CONFIRMED },
    });
    if (activeCount >= APP_CONSTANTS.BOOKING.MAX_ACTIVE_PER_DEVOTEE) {
      throw AppError.badRequest(
        `You cannot hold more than ${APP_CONSTANTS.BOOKING.MAX_ACTIVE_PER_DEVOTEE} active bookings simultaneously`
      );
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayBookingsCount = await prisma.booking.count({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    });
    if (todayBookingsCount >= APP_CONSTANTS.BOOKING.MAX_PER_DAY_PER_DEVOTEE) {
      throw AppError.badRequest('Daily booking creation threshold reached');
    }

    // 5. Open Transaction for Atomic Slot Reservation (Section 7.2)
    const result = await prisma.$transaction(async (tx) => {
      // Upsert slot inventory row as a safety net
      await tx.slotInventory.upsert({
        where: {
          scheduleId_slotDate: {
            scheduleId: schedule.id,
            slotDate,
          },
        },
        update: {},
        create: {
          scheduleId: schedule.id,
          templeId: pooja.templeId,
          slotDate,
          capacity: schedule.capacity,
          booked: 0,
          isBlocked: false,
        },
      });

      // Atomic reservation statement
      const inv = await tx.slotInventory.findUnique({
        where: {
          scheduleId_slotDate: {
            scheduleId: schedule.id,
            slotDate,
          },
        },
      });

      if (!inv || inv.isBlocked || inv.booked + devoteeCount > inv.capacity) {
        throw AppError.slotFull('This pooja slot is fully booked or blocked for the chosen date');
      }

      await tx.slotInventory.update({
        where: { id: inv.id },
        data: { booked: { increment: devoteeCount } },
      });

      const bookingCode = generateBookingCode();
      const unitPricePaise = pooja.pricePaise;
      const totalPaise = unitPricePaise * devoteeCount;

      const booking = await tx.booking.create({
        data: {
          code: bookingCode,
          userId,
          templeId: pooja.templeId,
          poojaId: pooja.id,
          scheduleId: schedule.id,
          occasionId: data.occasionId,
          bookingDate: slotDate,
          startTime: schedule.startTime,
          devoteeCount,
          unitPricePaise,
          totalPaise,
          status: BookingStatus.CONFIRMED,
          idempotencyKey,
          note: data.note,
          devotees: {
            create: data.devotees.map((d) => ({
              name: d.name,
              nakshatra: d.nakshatra,
              gotra: d.gotra,
            })),
          },
          history: {
            create: {
              fromStatus: null,
              toStatus: BookingStatus.CONFIRMED,
              reason: 'Initial booking confirmation',
            },
          },
        },
        include: {
          devotees: true,
          pooja: { select: { name: true, nameMl: true } },
          temple: { select: { name: true, slug: true } },
        },
      });

      return booking;
    });

    // 6. Post-commit push notification to user devices
    try {
      const devices = await prisma.deviceToken.findMany({ where: { userId } });
      for (const device of devices) {
        await pushService.sendToDevice(device.fcmToken, {
          title: 'Pooja Booking Confirmed',
          body: `Your booking for ${pooja.name} on ${data.bookingDate} is confirmed (Code: ${result.code}).`,
          data: { bookingId: result.id, type: 'booking_confirmed' },
        });
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to dispatch post-commit push notification');
    }

    return {
      ...result,
      qrPayload: generateQrPayload(result.id, result.templeId),
    };
  }

  static async listDevoteeBookings(userId: string, query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const where: Prisma.BookingWhereInput = { userId };

    if (query.status && typeof query.status === 'string') {
      where.status = query.status as BookingStatus;
    }

    if (query.upcoming === true) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      where.bookingDate = { gte: today };
      where.status = BookingStatus.CONFIRMED;
    }

    const items = await prisma.booking.findMany({
      where,
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { bookingDate: 'desc' },
      include: {
        pooja: { select: { name: true, nameMl: true } },
        temple: { select: { name: true, slug: true, coverImageUrl: true } },
        devotees: true,
      },
    });

    return buildPaginatedResponse(items, limit);
  }

  static async getDevoteeBooking(userId: string, bookingId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        pooja: true,
        temple: true,
        schedule: true,
        occasion: true,
        devotees: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!booking) {
      throw AppError.notFound('Booking not found');
    }

    return {
      ...booking,
      qrPayload: generateQrPayload(booking.id, booking.templeId),
    };
  }

  static async cancelBookingByDevotee(
    userId: string,
    bookingId: string,
    reason?: string
  ) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: { temple: true },
    });

    if (!booking) {
      throw AppError.notFound('Booking not found');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw AppError.badRequest('Only confirmed bookings can be cancelled');
    }

    // Section 7.5: Cancellation cutoff calculation
    const slotDateTime = new Date(booking.bookingDate);
    const [hours, mins] = booking.startTime.split(':').map(Number);
    slotDateTime.setUTCHours(hours || 0, mins || 0, 0, 0);

    const now = new Date();
    const hoursLeft = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursLeft < booking.temple.cancellationCutoffHours) {
      throw AppError.bookingNotCancellable(
        `Cancellation window closed. Temple policy requires cancelling at least ${booking.temple.cancellationCutoffHours} hours in advance.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      return await BookingStateService.transition(
        tx,
        booking.id,
        BookingStatus.CANCELLED,
        {
          changedById: userId,
          reason: reason || 'Cancelled by devotee',
        }
      );
    });
  }

  static async rescheduleBooking(
    userId: string,
    bookingId: string,
    newScheduleId: string,
    newDateStr: string
  ) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: { temple: true, history: true },
    });

    if (!booking) {
      throw AppError.notFound('Booking not found');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw AppError.badRequest('Only confirmed bookings can be rescheduled');
    }

    // Max 3 reschedules (Section 7.5)
    const rescheduleCount = booking.history.filter((h) =>
      h.reason?.startsWith('Rescheduled')
    ).length;
    if (rescheduleCount >= APP_CONSTANTS.BOOKING.MAX_RESCHEDULE_COUNT) {
      throw new AppError(
        'BOOKING_NOT_RESCHEDULABLE',
        400,
        `Maximum allowed reschedule limit (${APP_CONSTANTS.BOOKING.MAX_RESCHEDULE_COUNT}) reached for this booking`
      );
    }

    // Cutoff check on current booking
    const slotDateTime = new Date(booking.bookingDate);
    const [h, m] = booking.startTime.split(':').map(Number);
    slotDateTime.setUTCHours(h || 0, m || 0, 0, 0);
    const now = new Date();
    const hoursLeft = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft < booking.temple.cancellationCutoffHours) {
      throw new AppError(
        'BOOKING_NOT_RESCHEDULABLE',
        400,
        'Cannot reschedule within the cancellation cutoff window'
      );
    }

    const newSchedule = await prisma.poojaSchedule.findUnique({
      where: { id: newScheduleId },
    });
    if (!newSchedule || !newSchedule.isActive || newSchedule.poojaId !== booking.poojaId) {
      throw AppError.badRequest('Invalid new schedule selected');
    }

    const newDate = new Date(`${newDateStr}T00:00:00Z`);

    return await prisma.$transaction(async (tx) => {
      // 1. Ensure inventory row for new date
      await tx.slotInventory.upsert({
        where: {
          scheduleId_slotDate: {
            scheduleId: newSchedule.id,
            slotDate: newDate,
          },
        },
        update: {},
        create: {
          scheduleId: newSchedule.id,
          templeId: booking.templeId,
          slotDate: newDate,
          capacity: newSchedule.capacity,
          booked: 0,
        },
      });

      // 2. Reserve new slot
      const newInv = await tx.slotInventory.findUnique({
        where: {
          scheduleId_slotDate: {
            scheduleId: newSchedule.id,
            slotDate: newDate,
          },
        },
      });

      if (!newInv || newInv.isBlocked || newInv.booked + booking.devoteeCount > newInv.capacity) {
        throw AppError.slotFull('The target slot is full or blocked for the selected date');
      }

      await tx.slotInventory.update({
        where: { id: newInv.id },
        data: { booked: { increment: booking.devoteeCount } },
      });

      // 3. Release old slot
      const oldInv = await tx.slotInventory.findUnique({
        where: {
          scheduleId_slotDate: {
            scheduleId: booking.scheduleId,
            slotDate: booking.bookingDate,
          },
        },
      });
      if (oldInv) {
        await tx.slotInventory.update({
          where: { id: oldInv.id },
          data: { booked: Math.max(0, oldInv.booked - booking.devoteeCount) },
        });
      }

      // 4. Update booking row
      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          scheduleId: newSchedule.id,
          bookingDate: newDate,
          startTime: newSchedule.startTime,
        },
      });

      // 5. History entry
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: BookingStatus.CONFIRMED,
          toStatus: BookingStatus.CONFIRMED,
          changedById: userId,
          reason: `Rescheduled from ${booking.bookingDate.toISOString().split('T')[0]} to ${newDateStr}`,
        },
      });

      return updated;
    });
  }

  static async listTempleBookings(
    templeId: string,
    query: Record<string, unknown>
  ) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const where: Prisma.BookingWhereInput = { templeId };

    if (query.status && typeof query.status === 'string') {
      where.status = query.status as BookingStatus;
    }

    if (query.poojaId && typeof query.poojaId === 'string') {
      where.poojaId = query.poojaId;
    }

    if (query.date && typeof query.date === 'string') {
      where.bookingDate = new Date(`${query.date}T00:00:00Z`);
    }

    if (query.q && typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { code: { contains: q } },
        { user: { phone: { contains: q } } },
        { user: { name: { contains: q } } },
      ];
    }

    const items = await prisma.booking.findMany({
      where,
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: [{ bookingDate: 'desc' }, { startTime: 'asc' }],
      include: {
        pooja: { select: { id: true, name: true, pricePaise: true } },
        user: { select: { id: true, name: true, phone: true, email: true } },
        devotees: true,
      },
    });

    return buildPaginatedResponse(items, limit);
  }

  static async getTempleBooking(templeId: string, bookingId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, templeId },
      include: {
        pooja: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        devotees: true,
        schedule: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!booking) throw AppError.notFound('Booking not found');
    return booking;
  }

  static async checkInByQr(
    templeId: string,
    staffUserId: string,
    qrPayload: string
  ) {
    const data = verifyQrPayload(qrPayload);
    if (!data) {
      throw AppError.badRequest('Invalid or tampered QR code payload');
    }

    if (data.tId !== templeId) {
      throw AppError.badRequest('Booking belongs to another temple');
    }

    const booking = await prisma.booking.findUnique({
      where: { id: data.bId },
      include: {
        pooja: { select: { name: true } },
        devotees: true,
        user: { select: { name: true, phone: true } },
      },
    });

    if (!booking || booking.templeId !== templeId) {
      throw AppError.notFound('Booking record not found');
    }

    // Check if already checked in
    if (booking.checkedInAt) {
      return {
        alreadyCheckedIn: true,
        checkedInAt: booking.checkedInAt,
        message: 'Devotee has already been checked in',
        booking,
      };
    }

    // Transition to COMPLETED and mark check-in time
    const updated = await prisma.$transaction(async (tx) => {
      return await BookingStateService.transition(
        tx,
        booking.id,
        BookingStatus.COMPLETED,
        {
          changedById: staffUserId,
          reason: 'QR Code verified at entrance counter',
        }
      );
    });

    return {
      alreadyCheckedIn: false,
      message: 'Check-in verified successfully',
      booking: updated,
    };
  }

  static async updateBookingStatusByStaff(
    templeId: string,
    staffUserId: string,
    bookingId: string,
    toStatus: BookingStatus,
    reason?: string
  ) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, templeId },
    });
    if (!booking) throw AppError.notFound('Booking not found');

    return await prisma.$transaction(async (tx) => {
      return await BookingStateService.transition(tx, booking.id, toStatus, {
        changedById: staffUserId,
        reason: reason || 'Updated by temple staff',
      });
    });
  }

  static async exportBookingsCsv(
    templeId: string,
    query: Record<string, unknown>
  ): Promise<string> {
    const where: Prisma.BookingWhereInput = { templeId };

    if (query.date && typeof query.date === 'string') {
      where.bookingDate = new Date(`${query.date}T00:00:00Z`);
    }

    if (query.status && typeof query.status === 'string') {
      where.status = query.status as BookingStatus;
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
      include: {
        pooja: { select: { name: true } },
        user: { select: { name: true, phone: true, email: true } },
        devotees: true,
      },
    });

    const headers = [
      'Booking Code',
      'Date',
      'Time',
      'Pooja Name',
      'Devotee Count',
      'Devotees (Name, Nakshatra, Gotra)',
      'Total Amount (INR)',
      'Status',
      'User Name',
      'User Phone',
      'Checked In At',
      'Created At',
    ];

    const rows = bookings.map((b) => [
      b.code,
      b.bookingDate.toISOString().split('T')[0],
      b.startTime,
      b.pooja.name,
      b.devoteeCount,
      b.devotees
        .map((d) => `${d.name} (${d.nakshatra || '-'}, ${d.gotra || '-'})`)
        .join('; '),
      (b.totalPaise / 100).toFixed(2),
      b.status,
      b.user.name || '',
      b.user.phone || '',
      b.checkedInAt ? b.checkedInAt.toISOString() : '',
      b.createdAt.toISOString(),
    ]);

    return generateCsv(headers, rows);
  }
}
