import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../db/prisma.js';
import { GlobalRole } from '../generated/prisma/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: GlobalRole;
  name?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(optional = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let token: string | undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }

      if (!token) {
        if (optional) {
          return next();
        }
        return next(AppError.unauthorized('Authentication token is missing'));
      }

      const payload = await verifyAccessToken(token);

      // Verify active user in database
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, name: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return next(AppError.unauthorized('User account is invalid or suspended'));
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      };

      next();
    } catch (err) {
      if (optional) {
        return next();
      }
      return next(AppError.unauthorized('Invalid or expired authentication token'));
    }
  };
}
