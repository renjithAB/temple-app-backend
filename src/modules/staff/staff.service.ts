import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { TempleRole, GlobalRole } from '../../generated/prisma/index.js';
import { AuditService } from '../audit/audit.service.js';

export class StaffService {
  static async listStaff(templeId: string) {
    return await prisma.templeStaff.findMany({
      where: { templeId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async assignStaff(
    templeId: string,
    data: { email?: string; phone?: string; name?: string; role: TempleRole },
    actorId?: string,
    ip?: string
  ) {
    let user;

    if (data.email) {
      user = await prisma.user.findUnique({ where: { email: data.email } });
    } else if (data.phone) {
      user = await prisma.user.findUnique({ where: { phone: data.phone } });
    }

    if (!user) {
      // Create devotee account
      user = await prisma.user.create({
        data: {
          email: data.email || `phone_${data.phone}@placeholder.temple`,
          phone: data.phone,
          name: data.name || (data.email ? data.email.split('@')[0] : 'Temple Staff'),
          role: GlobalRole.DEVOTEE,
          isActive: true,
        },
      });
    }

    const staffRecord = await prisma.templeStaff.upsert({
      where: {
        userId_templeId: {
          userId: user.id,
          templeId,
        },
      },
      update: {
        role: data.role,
        isActive: true,
      },
      create: {
        userId: user.id,
        templeId,
        role: data.role,
        isActive: true,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true, phone: true },
        },
      },
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'staff.assign',
      entityType: 'temple_staff',
      entityId: staffRecord.id,
      after: { userId: user.id, role: data.role },
      ip,
    });

    return staffRecord;
  }

  static async removeStaff(
    templeId: string,
    userId: string,
    actorId?: string,
    ip?: string
  ) {
    const existing = await prisma.templeStaff.findUnique({
      where: {
        userId_templeId: {
          userId,
          templeId,
        },
      },
    });

    if (!existing) {
      throw AppError.notFound('Staff assignment not found');
    }

    // Section 8: Removing a staff member revokes all their sessions immediately
    await prisma.$transaction(async (tx) => {
      await tx.templeStaff.delete({
        where: {
          userId_templeId: {
            userId,
            templeId,
          },
        },
      });

      await tx.refreshSession.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
    });

    await AuditService.record({
      actorId,
      templeId,
      action: 'staff.remove',
      entityType: 'temple_staff',
      entityId: existing.id,
      before: { userId, role: existing.role },
      ip,
    });

    return { message: 'Staff member removed and sessions revoked' };
  }
}
