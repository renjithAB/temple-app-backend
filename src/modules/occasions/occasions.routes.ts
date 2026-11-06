import { Router } from 'express';
import { OccasionsController } from './occasions.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import {
  createOccasionSchema,
  updateOccasionSchema,
  occasionFilterSchema,
} from './occasions.schema.js';

// Public routes
export const publicOccasionRoutes = Router();

publicOccasionRoutes.get(
  '/occasions',
  validate({ query: occasionFilterSchema }),
  OccasionsController.listPlatformOccasions
);

publicOccasionRoutes.get(
  '/temples/:id/occasions',
  validate({ query: occasionFilterSchema }),
  OccasionsController.listTempleOccasions
);

// Admin routes (mounted under /admin/temples/:templeId/occasions)
export const adminOccasionRoutes = Router({ mergeParams: true });

adminOccasionRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));

adminOccasionRoutes.get('/', OccasionsController.listAdminOccasions);
adminOccasionRoutes.post(
  '/',
  validate({ body: createOccasionSchema }),
  OccasionsController.createOccasion
);
adminOccasionRoutes.patch(
  '/:id',
  validate({ body: updateOccasionSchema }),
  OccasionsController.updateOccasion
);
adminOccasionRoutes.delete('/:id', OccasionsController.deleteOccasion);
