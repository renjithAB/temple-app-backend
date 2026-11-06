export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SLOT_FULL'
  | 'SLOT_BLOCKED'
  | 'BOOKING_NOT_CANCELLABLE'
  | 'BOOKING_NOT_RESCHEDULABLE'
  | 'INVALID_OTP'
  | 'OTP_EXPIRED'
  | 'OTP_MAX_ATTEMPTS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new AppError('BAD_REQUEST', 400, message, details);
  }

  static validationError(message: string, details?: Record<string, unknown>) {
    return new AppError('VALIDATION_ERROR', 400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError('UNAUTHORIZED', 401, message);
  }

  static forbidden(message = 'Access denied') {
    return new AppError('FORBIDDEN', 403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', 404, message);
  }

  static emailNotVerified(message = 'Email address has not been verified', details?: Record<string, unknown>) {
    return new AppError('EMAIL_NOT_VERIFIED', 403, message, details);
  }

  static conflict(message: string, details?: Record<string, unknown>) {
    return new AppError('CONFLICT', 409, message, details);
  }

  static slotFull(message = 'This slot is full') {
    return new AppError('SLOT_FULL', 409, message);
  }

  static slotBlocked(message = 'This slot has been blocked by temple administration') {
    return new AppError('SLOT_BLOCKED', 409, message);
  }

  static bookingNotCancellable(message = 'Booking cannot be cancelled after the cutoff time') {
    return new AppError('BOOKING_NOT_CANCELLABLE', 400, message);
  }

  static rateLimited(message = 'Too many requests, please try again later') {
    return new AppError('RATE_LIMITED', 429, message);
  }

  static internal(message = 'An unexpected error occurred') {
    return new AppError('INTERNAL_ERROR', 500, message);
  }
}
