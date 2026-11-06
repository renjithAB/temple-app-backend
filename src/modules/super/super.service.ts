import sharp from 'sharp';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { storageService } from '../../integrations/storage/index.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/hashing.js';
import {
  TempleStatus,
  TempleRole,
  GlobalRole,
  Prisma,
} from '../../generated/prisma/index.js';
import {
  parsePagination,
  decodeCursor,
  buildPaginatedResponse,
} from '../../lib/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';

export class SuperService {
  static async uploadImage(fileBuffer: Buffer) {
    if (fileBuffer.length > 5 * 1024 * 1024) {
      throw AppError.badRequest('Image file size exceeds 5MB limit');
    }

    if (!MediaService.isValidImageSignature(fileBuffer)) {
      throw AppError.badRequest('Invalid image format. Genuine JPEG, PNG, or WebP required');
    }

    // High quality optimization with Sharp: max 1200x800, strip metadata, WebP format
    const optimizedBuffer = await sharp(fileBuffer)
      .resize({ width: 1200, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const filename = `${crypto.randomUUID()}.webp`;
    const folder = 'temples';

    const { url, publicId } = await storageService.uploadImage(
      optimizedBuffer,
      folder,
      filename
    );

    return { url, publicId };
  }

  static async updateTempleDetails(
    templeId: string,
    data: Prisma.TempleUpdateInput,
    actorId?: string,
    ip?: string
  ) {
    const before = await prisma.temple.findUnique({
      where: { id: templeId },
    });
    if (!before || before.deletedAt) throw AppError.notFound('Temple not found');

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
  static async createTemple(
    data: any,
    actorId?: string,
    ip?: string
  ) {
    const { adminPhone, adminEmail, adminName, ...templeData } = data;

    const existing = await prisma.temple.findUnique({
      where: { slug: templeData.slug },
    });
    if (existing) {
      throw AppError.conflict('A temple with this slug already exists');
    }

    const temple = await prisma.temple.create({
      data: {
        ...templeData,
        status: TempleStatus.ACTIVE,
      },
    });

    if (adminPhone || adminEmail) {
      try {
        await this.assignTempleAdmin(
          temple.id,
          { phone: adminPhone, email: adminEmail, name: adminName },
          actorId,
          ip
        );
      } catch (err) {
        console.warn('Initial admin assignment failed during temple creation:', err);
      }
    }

    await AuditService.record({
      actorId,
      templeId: temple.id,
      action: 'temple.create',
      entityType: 'temple',
      entityId: temple.id,
      after: temple as unknown as Record<string, unknown>,
      ip,
    });

    return temple;
  }

  static async updateTempleStatus(
    templeId: string,
    status: TempleStatus,
    actorId?: string,
    ip?: string
  ) {
    const temple = await prisma.temple.findUnique({
      where: { id: templeId },
    });
    if (!temple) throw AppError.notFound('Temple not found');

    const updated = await prisma.temple.update({
      where: { id: templeId },
      data: { status },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'temple.status_change',
      entityType: 'temple',
      entityId: templeId,
      before: { status: temple.status },
      after: { status },
      ip,
    });

    return updated;
  }

  static async assignTempleAdmin(
    templeId: string,
    data: { phone?: string; email?: string; name?: string },
    actorId?: string,
    ip?: string
  ) {
    const temple = await prisma.temple.findUnique({
      where: { id: templeId },
    });
    if (!temple) throw AppError.notFound('Temple not found');

    let user;
    if (data.email) {
      user = await prisma.user.findUnique({ where: { email: data.email } });
    } else if (data.phone) {
      user = await prisma.user.findUnique({ where: { phone: data.phone } });
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email || `phone_${data.phone}@placeholder.temple`,
          phone: data.phone,
          name: data.name || 'Temple Administrator',
          role: GlobalRole.DEVOTEE,
          isActive: true,
        },
      });
    }

    const staffAssignment = await prisma.templeStaff.upsert({
      where: {
        userId_templeId: {
          userId: user.id,
          templeId,
        },
      },
      update: {
        role: TempleRole.ADMIN,
        isActive: true,
      },
      create: {
        userId: user.id,
        templeId,
        role: TempleRole.ADMIN,
        isActive: true,
      },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
      },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'temple.admin_assign',
      entityType: 'temple_staff',
      entityId: staffAssignment.id,
      after: { userId: user.id, role: TempleRole.ADMIN },
      ip,
    });

    return staffAssignment;
  }

  static async listAllTemples(query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const items = await prisma.temple.findMany({
      where: { deletedAt: null },
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            staff: true,
            poojas: true,
            bookings: true,
          },
        },
      },
    });

    return buildPaginatedResponse(items, limit);
  }

  static async listUsers(query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const where: Prisma.UserWhereInput = {};

    if (query.role && typeof query.role === 'string') {
      where.role = query.role as GlobalRole;
    }

    if (query.status === 'ACTIVE') {
      where.isActive = true;
    } else if (query.status === 'SUSPENDED') {
      where.isActive = false;
    }

    if (query.templeId && typeof query.templeId === 'string' && query.templeId.trim()) {
      where.staffRoles = {
        some: {
          templeId: query.templeId.trim(),
        },
      };
    }

    if (query.q && typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q } },
        { name: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const items = await prisma.user.findMany({
      where,
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        staffRoles: {
          select: {
            id: true,
            role: true,
            isActive: true,
            temple: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return buildPaginatedResponse(items, limit);
  }

  static async setUserActive(
    userId: string,
    isActive: boolean,
    actorId?: string,
    ip?: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    const updated = await prisma.$transaction(async (tx) => {
      if (!isActive) {
        // Section 8: Suspending a user revokes all their sessions immediately
        await tx.refreshSession.updateMany({
          where: { userId },
          data: { revokedAt: new Date() },
        });
      }

      return await tx.user.update({
        where: { id: userId },
        data: { isActive },
        select: { id: true, email: true, isActive: true },
      });
    });

    await AuditService.record({
      actorId,
      action: isActive ? 'user.reactivate' : 'user.suspend',
      entityType: 'user',
      entityId: userId,
      before: { isActive: user.isActive },
      after: { isActive },
      ip,
    });

    return updated;
  }

  static async createUser(
    data: {
      email: string;
      password: string;
      name?: string;
      phone?: string | null;
      role?: GlobalRole;
      templeId?: string | null;
      templeRole?: TempleRole | null;
    },
    actorId?: string,
    ip?: string
  ) {
    const email = data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw AppError.conflict('A user with this email address already exists');
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: data.name?.trim() || null,
        phone: data.phone?.trim() || null,
        role: data.role || GlobalRole.DEVOTEE,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isActive: true,
      },
    });

    if (data.templeId && data.templeRole) {
      await prisma.templeStaff.upsert({
        where: {
          userId_templeId: {
            userId: user.id,
            templeId: data.templeId,
          },
        },
        create: {
          userId: user.id,
          templeId: data.templeId,
          role: data.templeRole,
          isActive: true,
        },
        update: {
          role: data.templeRole,
          isActive: true,
        },
      });
    }

    await AuditService.record({
      actorId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      after: { email: user.email, role: user.role },
      ip,
    });

    return user;
  }

  static async updateUser(
    userId: string,
    data: {
      name?: string;
      phone?: string | null;
      email?: string;
      role?: GlobalRole;
      isActive?: boolean;
      templeId?: string | null;
      templeRole?: TempleRole | null;
    },
    actorId?: string,
    ip?: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name?.trim() || null;
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (data.templeId && data.templeRole) {
      await prisma.templeStaff.upsert({
        where: {
          userId_templeId: {
            userId,
            templeId: data.templeId,
          },
        },
        create: {
          userId,
          templeId: data.templeId,
          role: data.templeRole,
          isActive: true,
        },
        update: {
          role: data.templeRole,
          isActive: true,
        },
      });
    } else if (data.templeId === null) {
      // Remove temple staff assignment if explicitly unlinked
      await prisma.templeStaff.deleteMany({
        where: { userId },
      });
    }

    await AuditService.record({
      actorId,
      action: 'user.update',
      entityType: 'user',
      entityId: userId,
      before: { email: user.email, name: user.name, role: user.role },
      after: { email: updated.email, name: updated.name, role: updated.role },
      ip,
    });

    return updated;
  }

  static async resetUserPassword(
    userId: string,
    newPasswordPlain: string,
    actorId?: string,
    ip?: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    const passwordHash = await hashPassword(newPasswordPlain);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          failedLogins: 0,
          lockedUntil: null,
          isEmailVerified: true,
        },
      }),
      prisma.refreshSession.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    await AuditService.record({
      actorId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: userId,
      ip,
    });

    return { message: 'Password reset successfully' };
  }

  static async listAllPoojas(query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const where: Prisma.PoojaWhereInput = { deletedAt: null };

    if (query.templeId && typeof query.templeId === 'string' && query.templeId.trim()) {
      where.templeId = query.templeId.trim();
    }

    if (query.q && typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q } },
        { nameMl: { contains: q } },
      ];
    }

    const items = await prisma.pooja.findMany({
      where,
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        temple: {
          select: {
            id: true,
            name: true,
            district: true,
            state: true,
          },
        },
      },
    });

    return buildPaginatedResponse(items, limit);
  }

  static async listAllOccasions(query: Record<string, unknown>) {
    const { cursor, limit } = parsePagination(query);
    const decodedCursor = decodeCursor(cursor);

    const where: Prisma.OccasionWhereInput = { deletedAt: null };

    if (query.templeId && typeof query.templeId === 'string' && query.templeId.trim()) {
      where.templeId = query.templeId.trim();
    }

    if (query.q && typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q } },
        { nameMl: { contains: q } },
      ];
    }

    const items = await prisma.occasion.findMany({
      where,
      take: limit + 1,
      skip: decodedCursor ? 1 : 0,
      cursor: decodedCursor ? { id: decodedCursor } : undefined,
      orderBy: { startDate: 'asc' },
      include: {
        temple: {
          select: {
            id: true,
            name: true,
            district: true,
            state: true,
          },
        },
      },
    });

    return buildPaginatedResponse(items, limit);
  }
}
