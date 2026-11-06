import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { GlobalRole } from '../generated/prisma/index.js';

export function authorize(...allowedRoles: GlobalRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }

    next();
  };
}
