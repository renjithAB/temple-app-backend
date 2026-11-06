import { z } from 'zod';
import { TempleStatus } from '../../generated/prisma/index.js';

export const createTempleSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    name: z.string().trim().min(2).max(150),
    nameMl: z.string().trim().max(150).optional().nullable(),
    deity: z.string().trim().min(2).max(100),
    description: z.string().trim().max(3000).optional().nullable(),
    descriptionMl: z.string().trim().max(3000).optional().nullable(),
    addressLine: z.string().trim().min(5).max(255),
    district: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100).default('Kerala'),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Invalid 6-digit PIN code').optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    coverImageUrl: z.string().trim().optional().nullable(),
    openingHours: z.record(z.string()).optional().nullable(),
    bookingAdvanceDays: z.number().int().min(1).max(365).default(60),
    cancellationCutoffHours: z.number().int().min(0).max(168).default(24),
    adminPhone: z.string().trim().max(30).optional().nullable(),
    adminEmail: z.string().trim().email().optional().nullable(),
    adminName: z.string().trim().max(100).optional().nullable(),
  })
  .strict();

export const updateTempleStatusSchema = z
  .object({
    status: z.nativeEnum(TempleStatus),
  })
  .strict();

export const assignTempleAdminSchema = z
  .object({
    phone: z.string().trim().optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    name: z.string().trim().min(2).max(100).optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: 'Either phone or email must be provided to assign an admin',
  });

export const searchUsersQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    role: z.enum(['DEVOTEE', 'SUPER_ADMIN']).optional(),
    templeId: z.string().trim().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'ALL']).optional(),
    cursor: z.string().trim().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  })
  .strict();

export const updateUserStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(6),
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().optional().nullable(),
    role: z.enum(['DEVOTEE', 'SUPER_ADMIN']).default('DEVOTEE'),
    templeId: z.string().uuid().optional().nullable(),
    templeRole: z.enum(['ADMIN', 'STAFF']).optional().nullable(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().optional().nullable(),
    email: z.string().trim().toLowerCase().email().optional(),
    role: z.enum(['DEVOTEE', 'SUPER_ADMIN']).optional(),
    isActive: z.boolean().optional(),
    templeId: z.string().uuid().optional().nullable(),
    templeRole: z.enum(['ADMIN', 'STAFF']).optional().nullable(),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(6),
  })
  .strict();
