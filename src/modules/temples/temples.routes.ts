import { Router } from 'express';
import { TemplesController } from './temples.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import {
  listTemplesQuerySchema,
  templeIdOrSlugParamSchema,
  updateTempleSchema,
  searchQuerySchema,
} from './temples.schema.js';

// Public router
export const publicTempleRoutes = Router();

publicTempleRoutes.get(
  '/temples',
  validate({ query: listTemplesQuerySchema }),
  TemplesController.listTemples
);

publicTempleRoutes.get(
  '/temples/:idOrSlug',
  validate({ params: templeIdOrSlugParamSchema }),
  TemplesController.getTemple
);

publicTempleRoutes.get(
  '/search',
  validate({ query: searchQuerySchema }),
  TemplesController.search
);

// Admin router (mounted under /admin/temples/:templeId)
export const adminTempleRoutes = Router({ mergeParams: true });

adminTempleRoutes.get(
  '/',
  authenticate(),
  templeScope(TempleRole.ADMIN),
  TemplesController.getAdminTemple
);

adminTempleRoutes.patch(
  '/',
  authenticate(),
  templeScope(TempleRole.ADMIN),
  validate({ body: updateTempleSchema }),
  TemplesController.updateTemple
);
