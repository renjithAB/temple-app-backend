import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { Prisma, Weekday } from '../../generated/prisma/index.js';
import { AuditService } from '../audit/audit.service.js';

const WEEKDAY_MAP: Record<number, Weekday> = {
  0: Weekday.SUN,
  1: Weekday.MON,
  2: Weekday.TUE,
  3: Weekday.WED,
  4: Weekday.THU,
  5: Weekday.FRI,
  6: Weekday.SAT,
};

export class PoojasService {
  static async listPublicPoojas(templeId: string) {
    return await prisma.pooja.findMany({
      where: {
        templeId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        schedules: {
          where: { isActive: true },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  static async getAvailability(
    poojaId: string,
    fromStr?: string,
    toStr?: string
  ) {
    const pooja = await prisma.pooja.findFirst({
      where: { id: poojaId, deletedAt: null, isActive: true },
      include: { temple: true },
    });

    if (!pooja) {
      throw AppError.notFound('Pooja not found');
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : today;
    const maxAdvance = new Date(today);
    maxAdvance.setDate(today.getDate() + pooja.temple.bookingAdvanceDays);

    let toDate = toStr ? new Date(`${toStr}T00:00:00Z`) : new Date(fromDate);
    if (!toStr) {
      toDate.setDate(fromDate.getDate() + 30);
    }

    if (toDate > maxAdvance) {
      toDate = maxAdvance;
    }

    // If one-time pooja with a specific date, lock query to that date
    let effectiveFrom = fromDate;
    let effectiveTo = toDate;
    if (pooja.isOneTime && pooja.oneTimeDate) {
      const oneTimeDateObj = new Date(pooja.oneTimeDate);
      effectiveFrom = oneTimeDateObj;
      effectiveTo = oneTimeDateObj;
    }

    // Query slot_inventory
    const slots = await prisma.slotInventory.findMany({
      where: {
        templeId: pooja.templeId,
        slotDate: {
          gte: effectiveFrom,
          lte: effectiveTo,
        },
        schedule: {
          poojaId,
          isActive: true,
        },
      },
      include: {
        schedule: {
          select: {
            id: true,
            weekday: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [{ slotDate: 'asc' }, { schedule: { startTime: 'asc' } }],
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentMinutesOfDay = currentHours * 60 + currentMinutes;

    return {
      pooja: {
        id: pooja.id,
        name: pooja.name,
        pricePaise: pooja.pricePaise,
        requiresBooking: pooja.requiresBooking,
        maxDevoteesPerBooking: pooja.maxDevoteesPerBooking,
        isOneTime: pooja.isOneTime,
        oneTimeDate: pooja.oneTimeDate ? pooja.oneTimeDate.toISOString().split('T')[0] : null,
        oneTimeStartTime: pooja.oneTimeStartTime,
        oneTimeEndTime: pooja.oneTimeEndTime,
        bookingCutoffHours: pooja.bookingCutoffHours,
        dailyCutoffTime: pooja.dailyCutoffTime,
      },
      slots: slots.map((s) => {
        const slotDateStr = s.slotDate.toISOString().split('T')[0];
        const [hStr, mStr] = (s.schedule.startTime || '00:00').split(':');
        const slotMinutesOfDay = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);

        let isCutoffPassed = false;
        let cutoffReason: string | undefined = undefined;

        if (slotDateStr < todayStr) {
          isCutoffPassed = true;
          cutoffReason = 'Date has passed';
        } else if (slotDateStr === todayStr) {
          // 1. If start time has already passed
          if (currentMinutesOfDay >= slotMinutesOfDay) {
            isCutoffPassed = true;
            cutoffReason = 'Scheduled pooja time has already passed';
          }

          // 2. Booking cutoff hours relative to slot start time
          if (!isCutoffPassed && pooja.bookingCutoffHours > 0) {
            const cutoffThresholdMinutes = slotMinutesOfDay - (pooja.bookingCutoffHours * 60);
            if (currentMinutesOfDay > cutoffThresholdMinutes) {
              isCutoffPassed = true;
              cutoffReason = `Booking closed: cutoff is ${pooja.bookingCutoffHours} hr(s) before start`;
            }
          }

          // 3. Daily cutoff time (e.g. 18:00)
          if (!isCutoffPassed && pooja.dailyCutoffTime) {
            const [dhStr, dmStr] = pooja.dailyCutoffTime.split(':');
            const dailyCutoffMinutes = (parseInt(dhStr, 10) || 0) * 60 + (parseInt(dmStr, 10) || 0);
            if (currentMinutesOfDay >= dailyCutoffMinutes) {
              isCutoffPassed = true;
              cutoffReason = `Same-day booking closed at ${pooja.dailyCutoffTime}`;
            }
          }
        }

        const isAvailable = !s.isBlocked && s.booked < s.capacity && !isCutoffPassed;

        return {
          id: s.id,
          scheduleId: s.scheduleId,
          date: slotDateStr,
          weekday: s.schedule.weekday,
          startTime: s.schedule.startTime,
          endTime: s.schedule.endTime,
          capacity: s.capacity,
          booked: s.booked,
          remainingSeats: Math.max(0, s.capacity - s.booked),
          isBlocked: s.isBlocked,
          isCutoffPassed,
          cutoffReason,
          isAvailable,
        };
      }),
    };
  }

  static async listAdminPoojas(templeId: string) {
    return await prisma.pooja.findMany({
      where: { templeId, deletedAt: null },
      include: {
        schedules: {
          where: { isActive: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createPooja(
    templeId: string,
    data: any,
    actorId?: string,
    ip?: string
  ) {
    const formattedData: any = { ...data };
    if (formattedData.oneTimeDate && typeof formattedData.oneTimeDate === 'string') {
      formattedData.oneTimeDate = new Date(`${formattedData.oneTimeDate}T00:00:00Z`);
    }

    const created = await prisma.pooja.create({
      data: {
        ...formattedData,
        temple: { connect: { id: templeId } },
      },
    });

    if (created.isOneTime && created.oneTimeDate && created.oneTimeStartTime) {
      const slotDate = new Date(created.oneTimeDate);
      const weekday = WEEKDAY_MAP[slotDate.getUTCDay()] || Weekday.SUN;
      const capacity = created.oneTimeCapacity || 50;

      const schedule = await prisma.poojaSchedule.create({
        data: {
          templeId,
          poojaId: created.id,
          weekday,
          startTime: created.oneTimeStartTime,
          endTime: created.oneTimeEndTime,
          capacity,
          isActive: true,
        },
      });

      await prisma.slotInventory.upsert({
        where: {
          scheduleId_slotDate: {
            scheduleId: schedule.id,
            slotDate,
          },
        },
        update: { capacity, isBlocked: false },
        create: {
          scheduleId: schedule.id,
          templeId,
          slotDate,
          capacity,
          booked: 0,
          isBlocked: false,
        },
      });
    }

    await AuditService.record({
      actorId,
      templeId,
      action: 'pooja.create',
      entityType: 'pooja',
      entityId: created.id,
      after: created as unknown as Record<string, unknown>,
      ip,
    });

    return created;
  }

  static async updatePooja(
    templeId: string,
    poojaId: string,
    data: any,
    actorId?: string,
    ip?: string
  ) {
    // Check through parent templeId: if not found, 404 (Section 4)
    const existing = await prisma.pooja.findFirst({
      where: { id: poojaId, templeId, deletedAt: null },
    });

    if (!existing) {
      throw AppError.notFound('Pooja not found');
    }

    const formattedData: any = { ...data };
    if (formattedData.oneTimeDate && typeof formattedData.oneTimeDate === 'string') {
      formattedData.oneTimeDate = new Date(`${formattedData.oneTimeDate}T00:00:00Z`);
    }

    const updated = await prisma.pooja.update({
      where: { id: poojaId },
      data: formattedData,
    });

    if (updated.isOneTime && updated.oneTimeDate && updated.oneTimeStartTime) {
      const slotDate = new Date(updated.oneTimeDate);
      const weekday = WEEKDAY_MAP[slotDate.getUTCDay()] || Weekday.SUN;
      const capacity = updated.oneTimeCapacity || 50;

      let schedule = await prisma.poojaSchedule.findFirst({
        where: { poojaId: updated.id, weekday, startTime: updated.oneTimeStartTime },
      });

      if (!schedule) {
        schedule = await prisma.poojaSchedule.create({
          data: {
            templeId,
            poojaId: updated.id,
            weekday,
            startTime: updated.oneTimeStartTime,
            endTime: updated.oneTimeEndTime,
            capacity,
            isActive: true,
          },
        });
      } else {
        schedule = await prisma.poojaSchedule.update({
          where: { id: schedule.id },
          data: {
            capacity,
            endTime: updated.oneTimeEndTime,
            isActive: true,
          },
        });
      }

      await prisma.slotInventory.upsert({
        where: {
          scheduleId_slotDate: {
            scheduleId: schedule.id,
            slotDate,
          },
        },
        update: { capacity, isBlocked: false },
        create: {
          scheduleId: schedule.id,
          templeId,
          slotDate,
          capacity,
          booked: 0,
          isBlocked: false,
        },
      });
    }

    await AuditService.record({
      actorId,
      templeId,
      action: 'pooja.update',
      entityType: 'pooja',
      entityId: poojaId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ip,
    });

    return updated;
  }

  static async deletePooja(
    templeId: string,
    poojaId: string,
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.pooja.findFirst({
      where: { id: poojaId, templeId, deletedAt: null },
    });

    if (!existing) {
      throw AppError.notFound('Pooja not found');
    }

    // Soft delete so existing bookings still point to valid row (Section 6.1)
    await prisma.pooja.update({
      where: { id: poojaId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'pooja.delete',
      entityType: 'pooja',
      entityId: poojaId,
      before: existing as unknown as Record<string, unknown>,
      ip,
    });

    return { message: 'Pooja deleted successfully' };
  }
}
