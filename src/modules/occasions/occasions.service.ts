import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { TempleStatus, Prisma } from '../../generated/prisma/index.js';
import { AuditService } from '../audit/audit.service.js';

export class OccasionsService {
  static async listPlatformOccasions(fromStr?: string, toStr?: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : today;
    const where: Prisma.OccasionWhereInput = {
      isPublished: true,
      deletedAt: null,
      endDate: { gte: fromDate },
      temple: { status: TempleStatus.ACTIVE, deletedAt: null },
    };

    if (toStr) {
      where.startDate = { lte: new Date(`${toStr}T00:00:00Z`) };
    }

    return await prisma.occasion.findMany({
      where,
      include: {
        temple: {
          select: { id: true, name: true, slug: true, district: true },
        },
        poojas: {
          include: {
            pooja: {
              select: { id: true, name: true, pricePaise: true },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  static async listTempleOccasions(
    templeId: string,
    fromStr?: string,
    toStr?: string
  ) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const fromDate = fromStr ? new Date(`${fromStr}T00:00:00Z`) : today;
    const where: Prisma.OccasionWhereInput = {
      templeId,
      isPublished: true,
      deletedAt: null,
      endDate: { gte: fromDate },
    };

    if (toStr) {
      where.startDate = { lte: new Date(`${toStr}T00:00:00Z`) };
    }

    return await prisma.occasion.findMany({
      where,
      include: {
        poojas: {
          include: {
            pooja: {
              select: { id: true, name: true, pricePaise: true },
            },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  static async listAdminOccasions(templeId: string) {
    return await prisma.occasion.findMany({
      where: { templeId, deletedAt: null },
      include: {
        poojas: {
          include: {
            pooja: { select: { id: true, name: true, pricePaise: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  static async createOccasion(
    templeId: string,
    data: {
      name: string;
      nameMl?: string | null;
      description?: string | null;
      startDate: string;
      endDate: string;
      startTime?: string | null;
      isRecurringYearly?: boolean;
      imageUrl?: string | null;
      isPublished?: boolean;
      poojaIds?: string[];
    },
    actorId?: string,
    ip?: string
  ) {
    const { poojaIds, ...occasionData } = data;

    const created = await prisma.occasion.create({
      data: {
        ...occasionData,
        templeId,
        startDate: new Date(`${data.startDate}T00:00:00Z`),
        endDate: new Date(`${data.endDate}T00:00:00Z`),
        poojas: poojaIds && poojaIds.length > 0
          ? {
              create: poojaIds.map((pId) => ({ poojaId: pId })),
            }
          : undefined,
      },
      include: { poojas: true },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'occasion.create',
      entityType: 'occasion',
      entityId: created.id,
      after: created as unknown as Record<string, unknown>,
      ip,
    });

    return created;
  }

  static async updateOccasion(
    templeId: string,
    occasionId: string,
    data: {
      name?: string;
      nameMl?: string | null;
      description?: string | null;
      startDate?: string;
      endDate?: string;
      startTime?: string | null;
      isRecurringYearly?: boolean;
      imageUrl?: string | null;
      isPublished?: boolean;
      poojaIds?: string[];
    },
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.occasion.findFirst({
      where: { id: occasionId, templeId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Occasion not found');

    const { poojaIds, ...occasionData } = data;

    const updatePayload: Prisma.OccasionUpdateInput = {
      ...occasionData,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00Z`) : undefined,
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : undefined,
    };

    if (poojaIds) {
      // Refresh linked poojas
      await prisma.occasionPooja.deleteMany({ where: { occasionId } });
      updatePayload.poojas = {
        create: poojaIds.map((pId) => ({ poojaId: pId })),
      };
    }

    const updated = await prisma.occasion.update({
      where: { id: occasionId },
      data: updatePayload,
      include: { poojas: true },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'occasion.update',
      entityType: 'occasion',
      entityId: occasionId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ip,
    });

    return updated;
  }

  static async deleteOccasion(
    templeId: string,
    occasionId: string,
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.occasion.findFirst({
      where: { id: occasionId, templeId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Occasion not found');

    // Soft delete
    await prisma.occasion.update({
      where: { id: occasionId },
      data: { deletedAt: new Date(), isPublished: false },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'occasion.delete',
      entityType: 'occasion',
      entityId: occasionId,
      before: existing as unknown as Record<string, unknown>,
      ip,
    });

    return { message: 'Occasion deleted successfully' };
  }
}
