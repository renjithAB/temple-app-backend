import { prisma } from '../../db/prisma.js';
import { pushService } from '../../integrations/push/index.js';
import { AuditService } from '../audit/audit.service.js';

export class NotificationsService {
  static async listPublicAnnouncements(templeId: string) {
    return await prisma.announcement.findMany({
      where: {
        templeId,
        deletedAt: null,
        publishAt: { lte: new Date() },
      },
      orderBy: { publishAt: 'desc' },
      select: {
        id: true,
        title: true,
        body: true,
        publishAt: true,
      },
    });
  }

  static async listAdminAnnouncements(templeId: string) {
    return await prisma.announcement.findMany({
      where: { templeId, deletedAt: null },
      orderBy: { publishAt: 'desc' },
    });
  }

  static async createAnnouncement(
    templeId: string,
    data: {
      title: string;
      body: string;
      publishAt?: string;
      sendPush?: boolean;
    },
    actorId: string,
    ip?: string
  ) {
    const publishDate = data.publishAt ? new Date(data.publishAt) : new Date();

    const created = await prisma.announcement.create({
      data: {
        templeId,
        title: data.title,
        body: data.body,
        publishAt: publishDate,
        sendPush: data.sendPush ?? false,
        createdById: actorId,
      },
    });

    // Section 10: Topic push notification for temple followers
    if (data.sendPush && publishDate <= new Date()) {
      await pushService.sendToTopic(`temple_${templeId}`, {
        title: data.title,
        body: data.body,
        data: {
          type: 'announcement',
          templeId,
          announcementId: created.id,
        },
      });
    }

    await AuditService.record({
      actorId,
      templeId,
      action: 'announcement.create',
      entityType: 'announcement',
      entityId: created.id,
      after: created as unknown as Record<string, unknown>,
      ip,
    });

    return created;
  }
}
