import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { Prisma } from '../../generated/prisma/index.js';
import { AuditService } from '../audit/audit.service.js';

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

    // Query slot_inventory
    const slots = await prisma.slotInventory.findMany({
      where: {
        templeId: pooja.templeId,
        slotDate: {
          gte: fromDate,
          lte: toDate,
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

    return {
      pooja: {
        id: pooja.id,
        name: pooja.name,
        pricePaise: pooja.pricePaise,
        requiresBooking: pooja.requiresBooking,
        maxDevoteesPerBooking: pooja.maxDevoteesPerBooking,
      },
      slots: slots.map((s) => ({
        id: s.id,
        scheduleId: s.scheduleId,
        date: s.slotDate.toISOString().split('T')[0],
        weekday: s.schedule.weekday,
        startTime: s.schedule.startTime,
        endTime: s.schedule.endTime,
        capacity: s.capacity,
        booked: s.booked,
        remainingSeats: Math.max(0, s.capacity - s.booked),
        isBlocked: s.isBlocked,
        isAvailable: !s.isBlocked && s.booked < s.capacity,
      })),
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
    data: Prisma.PoojaCreateInput,
    actorId?: string,
    ip?: string
  ) {
    const created = await prisma.pooja.create({
      data: {
        ...data,
        temple: { connect: { id: templeId } },
      },
    });

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
    data: Prisma.PoojaUpdateInput,
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

    const updated = await prisma.pooja.update({
      where: { id: poojaId },
      data,
    });

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
