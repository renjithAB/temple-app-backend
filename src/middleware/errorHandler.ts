import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const reqId = req.id || 'unknown';

  if (err instanceof AppError) {
    logger.warn(
      {
        requestId: reqId,
        code: err.code,
        status: err.httpStatus,
        details: err.details,
        path: req.path,
      },
      err.message
    );

    return res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Handle body-parser JSON syntax error
  if ('status' in err && (err as { status: number }).status === 400 && 'body' in err) {
    logger.warn({ requestId: reqId, path: req.path }, 'Malformed JSON body received');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload in request body',
        details: {},
      },
    });
  }

  // Unexpected internal errors
  logger.error(
    {
      requestId: reqId,
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Unhandled server error'
  );

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected internal error occurred',
      details: {
        errorType: err.name || 'Error',
      },
    },
  });
}
