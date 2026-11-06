import { Router } from 'express';
import { NotificationsController } from './notifications.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import { createAnnouncementSchema } from './notifications.schema.js';

// Public router
export const publicAnnouncementRoutes = Router();
publicAnnouncementRoutes.get('/temples/:id/announcements', NotificationsController.listPublicAnnouncements);

// Admin router (mounted under /admin/temples/:templeId/announcements)
export const adminAnnouncementRoutes = Router({ mergeParams: true });
adminAnnouncementRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));

adminAnnouncementRoutes.get('/', NotificationsController.listAdminAnnouncements);
adminAnnouncementRoutes.post(
  '/',
  validate({ body: createAnnouncementSchema }),
  NotificationsController.createAnnouncement
);
