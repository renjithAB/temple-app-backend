import { z } from 'zod';
import { BookingStatus } from '../../generated/prisma/index.js';

export const devoteeItemSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    nakshatra: z.string().trim().max(50).optional().nullable(),
    gotra: z.string().trim().max(50).optional().nullable(),
  })
  .strict();

export const createBookingSchema = z
  .object({
    poojaId: z.string().uuid('Invalid pooja ID'),
    scheduleId: z.string().uuid('Invalid schedule ID'),
    bookingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'bookingDate must be YYYY-MM-DD'),
    devotees: z
      .array(devoteeItemSchema)
      .min(1, 'At least one devotee is required')
      .max(10, 'Maximum devotees exceeded for single booking'),
    occasionId: z.string().uuid().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const cancelBookingSchema = z
  .object({
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export const rescheduleBookingSchema = z
  .object({
    newScheduleId: z.string().uuid('Invalid schedule ID'),
    newDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be YYYY-MM-DD'),
  })
  .strict();

export const checkInSchema = z
  .object({
    qrPayload: z.string().trim().min(1, 'QR payload is required'),
  })
  .strict();

export const updateBookingStatusSchema = z
  .object({
    status: z.enum([
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
    ]),
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

export const listBookingsQuerySchema = z
  .object({
    status: z.nativeEnum(BookingStatus).optional(),
    upcoming: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    poojaId: z.string().uuid().optional(),
    q: z.string().trim().optional(), // search by code or phone
    cursor: z.string().trim().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  })
  .strict();
