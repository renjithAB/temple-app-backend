import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
      .optional()
      .nullable(),
    language: z.enum(['en', 'ml']).optional(),
  })
  .strict();

export const familyMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    nakshatra: z.string().trim().max(50).optional().nullable(),
    gotra: z.string().trim().max(50).optional().nullable(),
    relation: z.string().trim().max(50).optional().nullable(),
  })
  .strict();

export const updateFamilyMemberSchema = familyMemberSchema.partial();

export const deviceTokenSchema = z
  .object({
    fcmToken: z.string().trim().min(10).max(500),
    platform: z.enum(['android', 'ios']),
  })
  .strict();

export const familyMemberParamSchema = z
  .object({
    id: z.string().uuid('Invalid family member ID'),
  })
  .strict();

export const deviceTokenParamSchema = z
  .object({
    fcmToken: z.string().trim().min(1),
  })
  .strict();
