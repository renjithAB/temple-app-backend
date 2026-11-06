import { Router } from 'express';
import { SlotsController } from './slots.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { TempleRole } from '../../generated/prisma/index.js';
import {
  createScheduleSchema,
  updateScheduleSchema,
  blockDateSchema,
} from './slots.schema.js';

// Mounted under /admin/temples/:templeId
export const scheduleRoutes = Router({ mergeParams: true });

scheduleRoutes.use(authenticate(), templeScope(TempleRole.ADMIN));

scheduleRoutes.get('/poojas/:poojaId/schedules', SlotsController.listSchedules);
scheduleRoutes.post(
  '/poojas/:poojaId/schedules',
  validate({ body: createScheduleSchema }),
  SlotsController.createSchedule
);

scheduleRoutes.patch(
  '/schedules/:id',
  validate({ body: updateScheduleSchema }),
  SlotsController.updateSchedule
);
scheduleRoutes.delete('/schedules/:id', SlotsController.deleteSchedule);
scheduleRoutes.post(
  '/schedules/:id/block-date',
  validate({ body: blockDateSchema }),
  SlotsController.blockDate
);
