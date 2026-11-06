import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/index.js';
import { logger } from '../../lib/logger.js';

export interface RecordAuditOptions {
  actorId?: string | null;
  templeId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

export class AuditService {
  static async record(options: RecordAuditOptions): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: options.actorId,
          templeId: options.templeId,
          action: options.action,
          entityType: options.entityType,
          entityId: options.entityId,
          before: options.before ? (options.before as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: options.after ? (options.after as Prisma.InputJsonValue) : Prisma.JsonNull,
          ip: options.ip,
        },
      });
    } catch (err) {
      // Never let audit log failure break the main operation, but log heavily
      logger.error({ err, options }, 'Failed to record audit log');
    }
  }
}
