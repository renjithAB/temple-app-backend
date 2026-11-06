import { z } from 'zod';

export const occasionBaseSchema = z.object({
  name: z.string().trim().min(2).max(150),
  nameMl: z.string().trim().max(150).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format'),
  startTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'startTime must be in HH:MM format')
    .optional()
    .nullable(),
  isRecurringYearly: z.boolean().default(false),
  imageUrl: z.string().trim().optional().nullable(),
  isPublished: z.boolean().default(false),
  poojaIds: z.array(z.string().uuid()).optional(),
});

export const createOccasionSchema = occasionBaseSchema.refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  }
);

export const updateOccasionSchema = occasionBaseSchema.partial();

export const occasionFilterSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
