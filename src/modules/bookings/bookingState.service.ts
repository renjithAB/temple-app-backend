import { PrismaClient, BookingStatus, Prisma } from '../../generated/prisma/index.js';
import { AppError } from '../../lib/errors.js';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class BookingStateService {
  private static readonly ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
    [BookingStatus.CONFIRMED]: [
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
    ],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
    [BookingStatus.NO_SHOW]: [],
  };

  static async transition(
    tx: TransactionClient,
    bookingId: string,
    toStatus: BookingStatus,
    options: {
      changedById?: string;
      reason?: string;
    }
  ) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        schedule: true,
      },
    });

    if (!booking) {
      throw AppError.notFound('Booking not found');
    }

    const currentStatus = booking.status;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus];

    if (!allowed || !allowed.includes(toStatus)) {
      throw AppError.badRequest(
        `Cannot transition booking status from ${currentStatus} to ${toStatus}`
      );
    }

    // Section 7.4: Releasing capacity when a booking becomes CANCELLED
    if (toStatus === BookingStatus.CANCELLED) {
      const inv = await tx.slotInventory.findUnique({
        where: {
          scheduleId_slotDate: {
            scheduleId: booking.scheduleId,
            slotDate: booking.bookingDate,
          },
        },
      });
      if (inv) {
        await tx.slotInventory.update({
          where: { id: inv.id },
          data: { booked: Math.max(0, inv.booked - booking.devoteeCount) },
        });
      }
    }

    // Update booking row
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: toStatus,
        cancelledAt: toStatus === BookingStatus.CANCELLED ? new Date() : undefined,
        cancelReason: toStatus === BookingStatus.CANCELLED ? options.reason : undefined,
        checkedInAt: toStatus === BookingStatus.COMPLETED && !booking.checkedInAt ? new Date() : undefined,
      },
    });

    // Record status transition in history
    await tx.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: currentStatus,
        toStatus,
        changedById: options.changedById,
        reason: options.reason,
      },
    });

    return updatedBooking;
  }
}
