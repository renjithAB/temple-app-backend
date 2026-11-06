import { z } from 'zod';

export const listTemplesQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    district: z.string().trim().optional(),
    deity: z.string().trim().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(500).optional(),
    cursor: z.string().trim().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
  })
  .strict();

export const templeIdOrSlugParamSchema = z
  .object({
    idOrSlug: z.string().trim().min(1),
  })
  .strict();

export const updateTempleSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    nameMl: z.string().trim().max(150).optional().nullable(),
    deity: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(3000).optional().nullable(),
    descriptionMl: z.string().trim().max(3000).optional().nullable(),
    addressLine: z.string().trim().min(5).max(255).optional(),
    district: z.string().trim().min(2).max(100).optional(),
    state: z.string().trim().min(2).max(100).optional(),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Invalid 6-digit PIN code').optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    coverImageUrl: z.string().trim().optional().nullable(),
    openingHours: z.record(z.string()).optional().nullable(),
    bookingAdvanceDays: z.number().int().min(1).max(365).optional(),
    cancellationCutoffHours: z.number().int().min(0).max(168).optional(),
  })
  .strict();

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1, 'Search term is required'),
    limit: z.coerce.number().min(1).max(50).optional(),
  })
  .strict();
