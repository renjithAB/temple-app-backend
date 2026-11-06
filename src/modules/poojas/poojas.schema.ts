import { z } from 'zod';

export const createPoojaSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    nameMl: z.string().trim().max(150).optional().nullable(),
    description: z.string().trim().max(3000).optional().nullable(),
    pricePaise: z.number().int().min(0).default(0), // in paise (e.g. 10000 = Rs 100)
    durationMinutes: z.number().int().positive().max(720).optional().nullable(),
    maxDevoteesPerBooking: z.number().int().min(1).max(20).default(5),
    requiresBooking: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updatePoojaSchema = createPoojaSchema.partial();

export const availabilityQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'from date must be YYYY-MM-DD')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'to date must be YYYY-MM-DD')
      .optional(),
  })
  .strict();

export const poojaIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();
