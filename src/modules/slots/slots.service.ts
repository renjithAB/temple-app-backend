import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { Weekday, BookingStatus } from '../../generated/prisma/index.js';
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

export class SlotsService {
  static async listSchedules(templeId: string, poojaId: string) {
    const pooja = await prisma.pooja.findFirst({
      where: { id: poojaId, templeId, deletedAt: null },
    });
    if (!pooja) throw AppError.notFound('Pooja not found');

    return await prisma.poojaSchedule.findMany({
      where: { poojaId, templeId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  static async createSchedule(
    templeId: string,
    poojaId: string,
    data: {
      weekday: Weekday;
      startTime: string;
      endTime?: string | null;
      capacity: number;
      isActive?: boolean;
    },
    actorId?: string,
    ip?: string
  ) {
    const pooja = await prisma.pooja.findFirst({
      where: { id: poojaId, templeId, deletedAt: null },
      include: { temple: true },
    });
    if (!pooja) throw AppError.notFound('Pooja not found');

    const schedule = await prisma.poojaSchedule.create({
      data: {
        templeId,
        poojaId,
        weekday: data.weekday,
        startTime: data.startTime,
        endTime: data.endTime,
        capacity: data.capacity,
        isActive: data.isActive ?? true,
      },
    });

    // Populate inventory for advance days window
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const advanceDays = pooja.temple.bookingAdvanceDays;
    const inventoryRows = [];

    for (let i = 0; i <= advanceDays; i++) {
      const slotDate = new Date(today);
      slotDate.setDate(today.getDate() + i);

      if (WEEKDAY_MAP[slotDate.getUTCDay()] === schedule.weekday) {
        inventoryRows.push({
          scheduleId: schedule.id,
          templeId,
          slotDate,
          capacity: schedule.capacity,
          booked: 0,
          isBlocked: false,
        });
      }
    }

    if (inventoryRows.length > 0) {
      for (const row of inventoryRows) {
        await prisma.slotInventory.upsert({
          where: {
            scheduleId_slotDate: {
              scheduleId: row.scheduleId,
              slotDate: row.slotDate,
            },
          },
          update: {},
          create: row,
        });
      }
    }

    await AuditService.record({
      actorId,
      templeId,
      action: 'schedule.create',
      entityType: 'pooja_schedule',
      entityId: schedule.id,
      after: schedule as unknown as Record<string, unknown>,
      ip,
    });

    return schedule;
  }

  static async updateSchedule(
    templeId: string,
    scheduleId: string,
    data: {
      weekday?: Weekday;
      startTime?: string;
      endTime?: string | null;
      capacity?: number;
      isActive?: boolean;
    },
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.poojaSchedule.findFirst({
      where: { id: scheduleId, templeId },
    });
    if (!existing) throw AppError.notFound('Schedule not found');

    const updated = await prisma.poojaSchedule.update({
      where: { id: scheduleId },
      data,
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'schedule.update',
      entityType: 'pooja_schedule',
      entityId: scheduleId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ip,
    });

    return updated;
  }

  static async deleteSchedule(
    templeId: string,
    scheduleId: string,
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.poojaSchedule.findFirst({
      where: { id: scheduleId, templeId },
    });
    if (!existing) throw AppError.notFound('Schedule not found');

    // Soft deactivate schedule
    const updated = await prisma.poojaSchedule.update({
      where: { id: scheduleId },
      data: { isActive: false },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'schedule.deactivate',
      entityType: 'pooja_schedule',
      entityId: scheduleId,
      before: existing as unknown as Record<string, unknown>,
      ip,
    });

    return { message: 'Schedule deactivated successfully' };
  }

  static async blockDate(
    templeId: string,
    scheduleId: string,
    data: {
      date: string;
      isBlocked: boolean;
      capacityOverride?: number;
      force?: boolean;
    },
    actorId?: string,
    ip?: string
  ) {
    const schedule = await prisma.poojaSchedule.findFirst({
      where: { id: scheduleId, templeId },
    });
    if (!schedule) throw AppError.notFound('Schedule not found');

    const slotDate = new Date(`${data.date}T00:00:00Z`);

    // Ensure slot_inventory row exists
    let inventory = await prisma.slotInventory.findUnique({
      where: {
        scheduleId_slotDate: {
          scheduleId,
          slotDate,
        },
      },
    });

    if (!inventory) {
      inventory = await prisma.slotInventory.create({
        data: {
          scheduleId,
          templeId,
          slotDate,
          capacity: schedule.capacity,
          booked: 0,
          isBlocked: false,
        },
      });
    }

    // Section 7.1: If blocking a date with existing bookings, return warning unless forced
    if (data.isBlocked && !data.force) {
      const activeBookings = await prisma.booking.findMany({
        where: {
          scheduleId,
          bookingDate: slotDate,
          status: BookingStatus.CONFIRMED,
        },
        select: {
          id: true,
          code: true,
          devoteeCount: true,
          user: { select: { name: true, phone: true } },
        },
      });

      if (activeBookings.length > 0) {
        return {
          warning: 'Existing confirmed bookings are affected by this block',
          requiresConfirmation: true,
          affectedBookingsCount: activeBookings.length,
          affectedBookings: activeBookings,
        };
      }
    }

    const updated = await prisma.slotInventory.update({
      where: { id: inventory.id },
      data: {
        isBlocked: data.isBlocked,
        capacity: data.capacityOverride !== undefined ? data.capacityOverride : inventory.capacity,
      },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: data.isBlocked ? 'slot.block' : 'slot.unblock',
      entityType: 'slot_inventory',
      entityId: updated.id,
      before: inventory as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ip,
    });

    return updated;
  }
}
