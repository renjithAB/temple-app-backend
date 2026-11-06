import { prisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export class UsersService {
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        language: true,
        createdAt: true,
        staffRoles: {
          where: { isActive: true },
          select: {
            templeId: true,
            role: true,
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

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return user;
  }

  static async updateProfile(
    userId: string,
    data: { name?: string; phone?: string | null; language?: string }
  ) {
    if (data.phone) {
      const existing = await prisma.user.findFirst({
        where: {
          phone: data.phone,
          id: { not: userId },
        },
      });
      if (existing) {
        throw AppError.conflict('Phone number is already associated with another account');
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        language: true,
      },
    });

    return updated;
  }

  static async deleteAccount(userId: string) {
    // Play Store compliance: Anonymize user record, keep historical bookings intact
    await prisma.$transaction(async (tx) => {
      // Delete device tokens and family members
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.familyMember.deleteMany({ where: { userId } });

      // Revoke all refresh sessions
      await tx.refreshSession.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });

      // Anonymize user fields
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@deleted.local`,
          name: 'Deleted Devotee',
          phone: null,
          passwordHash: null,
          isActive: false,
        },
      });
    });

    logger.info({ userId }, 'Devotee account deleted and anonymized');
    return { message: 'Account successfully deleted' };
  }

  static async listFamilyMembers(userId: string) {
    return await prisma.familyMember.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  static async createFamilyMember(
    userId: string,
    data: { name: string; nakshatra?: string | null; gotra?: string | null; relation?: string | null }
  ) {
    return await prisma.familyMember.create({
      data: {
        userId,
        name: data.name,
        nakshatra: data.nakshatra,
        gotra: data.gotra,
        relation: data.relation,
      },
    });
  }

  static async updateFamilyMember(
    userId: string,
    id: string,
    data: { name?: string; nakshatra?: string | null; gotra?: string | null; relation?: string | null }
  ) {
    const member = await prisma.familyMember.findFirst({
      where: { id, userId },
    });

    if (!member) {
      throw AppError.notFound('Family member not found');
    }

    return await prisma.familyMember.update({
      where: { id },
      data,
    });
  }

  static async deleteFamilyMember(userId: string, id: string) {
    const member = await prisma.familyMember.findFirst({
      where: { id, userId },
    });

    if (!member) {
      throw AppError.notFound('Family member not found');
    }

    await prisma.familyMember.delete({
      where: { id },
    });

    return { message: 'Family member removed successfully' };
  }

  static async registerDeviceToken(
    userId: string,
    fcmToken: string,
    platform: string
  ) {
    return await prisma.deviceToken.upsert({
      where: { fcmToken },
      update: { userId, platform, updatedAt: new Date() },
      create: { userId, fcmToken, platform },
    });
  }

  static async unregisterDeviceToken(userId: string, fcmToken: string) {
    await prisma.deviceToken.deleteMany({
      where: { userId, fcmToken },
    });
    return { message: 'Device token removed' };
  }
}
