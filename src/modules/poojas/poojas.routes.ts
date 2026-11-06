import { Router } from 'express';
import { PoojasController } from './poojas.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import {
  createPoojaSchema,
  updatePoojaSchema,
  availabilityQuerySchema,
  poojaIdParamSchema,
} from './poojas.schema.js';

// Public pooja routes
export const publicPoojaRoutes = Router();

publicPoojaRoutes.get('/temples/:id/poojas', PoojasController.listPublicPoojas);

publicPoojaRoutes.get(
  '/poojas/:id/availability',
  validate({ params: poojaIdParamSchema, query: availabilityQuerySchema }),
  PoojasController.getAvailability
);

// Admin pooja routes (mounted under /admin/temples/:templeId/poojas)
export const adminPoojaRoutes = Router({ mergeParams: true });

adminPoojaRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));

adminPoojaRoutes.get('/', PoojasController.listAdminPoojas);
adminPoojaRoutes.post('/', validate({ body: createPoojaSchema }), PoojasController.createPooja);
adminPoojaRoutes.patch('/:id', validate({ body: updatePoojaSchema }), PoojasController.updatePooja);
adminPoojaRoutes.delete('/:id', PoojasController.deletePooja);
