import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { prisma } from '../db/prisma.js';
import { GlobalRole, TempleRole } from '../generated/prisma/index.js';
import { getParam } from '../lib/params.js';

export interface VerifiedTempleScope {
  templeId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
}

export function templeScope(minRole: TempleRole = TempleRole.STAFF) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized());
      }

      const templeId = getParam(req, 'templeId');
      if (!templeId) {
        return next(AppError.badRequest('Missing templeId parameter'));
      }

      // Check if temple exists and is not deleted
      const temple = await prisma.temple.findFirst({
        where: {
          id: templeId,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });

      if (!temple) {
        // Return 404 so existence of foreign/deleted temples is not leaked
        return next(AppError.notFound('Temple not found'));
      }

      // SUPER_ADMIN has full administrative bypass for any temple
      if (req.user.role === GlobalRole.SUPER_ADMIN) {
        req.templeScope = {
          templeId,
          role: 'SUPER_ADMIN',
        };
        return next();
      }

      // Look up staff role in temple_staff
      const staffRecord = await prisma.templeStaff.findUnique({
        where: {
          userId_templeId: {
            userId: req.user.id,
            templeId,
          },
        },
      });

      if (!staffRecord || !staffRecord.isActive) {
        // Return 404 rather than 403 to prevent cross-tenant enumeration
        return next(AppError.notFound('Temple not found or access denied'));
      }

      // If action requires ADMIN, verify staff member has ADMIN role
      if (minRole === TempleRole.ADMIN && staffRecord.role !== TempleRole.ADMIN) {
        return next(AppError.forbidden('Requires Temple Administrator role'));
      }

      req.templeScope = {
        templeId,
        role: staffRecord.role,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
