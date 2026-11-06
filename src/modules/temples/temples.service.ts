import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { TempleStatus, Prisma } from '../../generated/prisma/index.js';
import {
  parsePagination,
  decodeCursor,
  buildPaginatedResponse,
} from '../../lib/pagination.js';
import { AuditService } from '../audit/audit.service.js';

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class TemplesService {
  static async listTemples(query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const userLat = query.lat !== undefined && query.lat !== null && query.lat !== ''
      ? Number(query.lat)
      : undefined;
    const userLng = query.lng !== undefined && query.lng !== null && query.lng !== ''
      ? Number(query.lng)
      : undefined;
    const radiusKm = query.radiusKm !== undefined && query.radiusKm !== null && query.radiusKm !== ''
      ? Number(query.radiusKm)
      : undefined;

    const where: Prisma.TempleWhereInput = {
      status: TempleStatus.ACTIVE,
      deletedAt: null,
    };

    if (typeof query.district === 'string' && query.district.trim()) {
      where.district = { equals: query.district.trim() };
    }

    if (typeof query.deity === 'string' && query.deity.trim()) {
      where.deity = { contains: query.deity.trim() };
    }

    if (typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q } },
        { nameMl: { contains: q } },
        { deity: { contains: q } },
        { district: { contains: q } },
      ];
    }

    // If radius filtering is active, fetch a larger batch so we can filter and sort by distance
    const fetchLimit = radiusKm ? 150 : limit + 1;

    const rawItems = await prisma.temple.findMany({
      where,
      take: fetchLimit,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        nameMl: true,
        deity: true,
        addressLine: true,
        district: true,
        state: true,
        latitude: true,
        longitude: true,
        coverImageUrl: true,
        openingHours: true,
      },
    });

    let items = rawItems.map((item) => {
      let distanceKm: number | null = null;
      if (
        userLat !== undefined &&
        userLng !== undefined &&
        item.latitude !== null &&
        item.longitude !== null
      ) {
        const d = calculateHaversineDistance(
          userLat,
          userLng,
          Number(item.latitude),
          Number(item.longitude)
        );
        distanceKm = Math.round(d * 10) / 10;
      }
      return {
        ...item,
        distanceKm,
      };
    });

    if (radiusKm !== undefined && userLat !== undefined && userLng !== undefined) {
      items = items.filter(
        (t) => t.distanceKm !== null && t.distanceKm <= radiusKm
      );
      items.sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
    } else if (userLat !== undefined && userLng !== undefined) {
      // Sort by proximity when coordinates are provided
      items.sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
    }

    return buildPaginatedResponse(items, limit);
  }

  static async getTempleByIdOrSlug(idOrSlug: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug
      );

    const temple = await prisma.temple.findFirst({
      where: {
        OR: isUuid ? [{ id: idOrSlug }, { slug: idOrSlug }] : [{ slug: idOrSlug }],
        deletedAt: null,
      },
      include: {
        poojas: {
          where: { isActive: true, deletedAt: null },
          select: {
            id: true,
            name: true,
            nameMl: true,
            description: true,
            pricePaise: true,
            durationMinutes: true,
            requiresBooking: true,
            maxDevoteesPerBooking: true,
          },
        },
        occasions: {
          where: {
            isPublished: true,
            deletedAt: null,
            endDate: { gte: new Date() },
          },
          orderBy: { startDate: 'asc' },
          take: 5,
        },
        announcements: {
          where: { deletedAt: null, publishAt: { lte: new Date() } },
          orderBy: { publishAt: 'desc' },
          take: 3,
        },
      },
    });

    if (!temple) {
      throw AppError.notFound('Temple not found');
    }

    return temple;
  }

  static async updateTemple(
    templeId: string,
    data: Prisma.TempleUpdateInput,
    actorId?: string,
    ip?: string
  ) {
    const before = await prisma.temple.findUnique({
      where: { id: templeId },
    });

    if (!before || before.deletedAt) {
      throw AppError.notFound('Temple not found');
    }

    const updated = await prisma.temple.update({
      where: { id: templeId },
      data,
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'temple.update',
      entityType: 'temple',
      entityId: templeId,
      before: before as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      ip,
    });

    return updated;
  }

  static async search(query: string, limit = 10) {
    const q = query.trim();
    if (!q) return { temples: [], poojas: [], occasions: [] };

    const [temples, poojas, occasions] = await Promise.all([
      prisma.temple.findMany({
        where: {
          status: TempleStatus.ACTIVE,
          deletedAt: null,
          OR: [
            { name: { contains: q } },
            { nameMl: { contains: q } },
            { deity: { contains: q } },
            { district: { contains: q } },
          ],
        },
        take: limit,
        select: {
          id: true,
          slug: true,
          name: true,
          nameMl: true,
          deity: true,
          district: true,
          coverImageUrl: true,
        },
      }),

      prisma.pooja.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          temple: { status: TempleStatus.ACTIVE, deletedAt: null },
          OR: [
            { name: { contains: q } },
            { nameMl: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          nameMl: true,
          pricePaise: true,
          temple: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),

      prisma.occasion.findMany({
        where: {
          isPublished: true,
          deletedAt: null,
          endDate: { gte: new Date() },
          temple: { status: TempleStatus.ACTIVE, deletedAt: null },
          OR: [
            { name: { contains: q } },
            { nameMl: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          nameMl: true,
          startDate: true,
          endDate: true,
          temple: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),
    ]);

    return { temples, poojas, occasions };
  }
}
