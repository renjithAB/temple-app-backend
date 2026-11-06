import { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

export function notFoundHandler(req: Request, res: Response) {
  const err = AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`);
  return res.status(err.httpStatus).json({
    error: {
      code: err.code,
      message: err.message,
      details: {},
    },
  });
}
