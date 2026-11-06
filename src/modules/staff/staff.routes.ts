import { Router } from 'express';
import { StaffController } from './staff.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { templeScope } from '../../middleware/templeScope.js';
import { validate } from '../../middleware/validate.js';
import { TempleRole } from '../../generated/prisma/index.js';
import { assignStaffSchema, removeStaffParamSchema } from './staff.schema.js';

const router = Router({ mergeParams: true });

router.use(authenticate(), templeScope(TempleRole.ADMIN));

router.get('/', StaffController.listStaff);
router.post('/', validate({ body: assignStaffSchema }), StaffController.assignStaff);
router.delete('/:userId', validate({ params: removeStaffParamSchema }), StaffController.removeStaff);

export const staffRoutes = router;
