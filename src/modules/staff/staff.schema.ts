import { z } from 'zod';
import { TempleRole } from '../../generated/prisma/index.js';

export const assignStaffSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address')
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
      .optional(),
    name: z.string().trim().min(2).max(100).optional(),
    role: z.nativeEnum(TempleRole),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone must be provided to assign staff',
    path: ['email'],
  });

export const removeStaffParamSchema = z
  .object({
    templeId: z.string().uuid(),
    userId: z.string().uuid(),
  })
  .strict();
