import { z } from 'zod';
import { Weekday } from '../../generated/prisma/index.js';

export const createScheduleSchema = z
  .object({
    weekday: z.nativeEnum(Weekday),
    startTime: z
      .string()
      .trim()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'startTime must be in HH:MM format'),
    endTime: z
      .string()
      .trim()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'endTime must be in HH:MM format')
      .optional()
      .nullable(),
    capacity: z.number().int().positive('Capacity must be at least 1'),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateScheduleSchema = createScheduleSchema.partial();

export const blockDateSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
    isBlocked: z.boolean(),
    capacityOverride: z.number().int().min(0).optional(),
    force: z.boolean().default(false), // Admin confirmation if bookings exist
  })
  .strict();

export const scheduleIdParamSchema = z
  .object({
    templeId: z.string().uuid(),
    id: z.string().uuid(),
  })
  .strict();
