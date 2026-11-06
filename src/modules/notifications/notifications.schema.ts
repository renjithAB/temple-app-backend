import { z } from 'zod';

export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    body: z.string().trim().min(5).max(3000),
    publishAt: z.string().datetime().optional(),
    sendPush: z.boolean().default(false),
  })
  .strict();
