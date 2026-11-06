import { Router } from 'express';
import multer from 'multer';
import { SuperController } from './super.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { GlobalRole } from '../../generated/prisma/index.js';
import {
  createTempleSchema,
  updateTempleStatusSchema,
  assignTempleAdminSchema,
  searchUsersQuerySchema,
  updateUserStatusSchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from './super.schema.js';
import { updateTempleSchema } from '../temples/temples.schema.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

// All super admin endpoints require SUPER_ADMIN role
router.use(authenticate(), authorize(GlobalRole.SUPER_ADMIN));

router.post('/upload', upload.single('image'), SuperController.uploadImage);

router.post('/temples', validate({ body: createTempleSchema }), SuperController.createTemple);
router.patch(
  '/temples/:id',
  validate({ body: updateTempleSchema }),
  SuperController.updateTempleDetails
);
router.patch(
  '/temples/:id/status',
  validate({ body: updateTempleStatusSchema }),
  SuperController.updateTempleStatus
);
router.post(
  '/temples/:id/admins',
  validate({ body: assignTempleAdminSchema }),
  SuperController.assignTempleAdmin
);
router.get('/temples', SuperController.listTemples);

router.get('/users', validate({ query: searchUsersQuerySchema }), SuperController.listUsers);
router.post('/users', validate({ body: createUserSchema }), SuperController.createUser);
router.patch('/users/:id', validate({ body: updateUserSchema }), SuperController.updateUser);
router.post(
  '/users/:id/reset-password',
  validate({ body: resetPasswordSchema }),
  SuperController.resetUserPassword
);
router.patch(
  '/users/:id/status',
  validate({ body: updateUserStatusSchema }),
  SuperController.updateUserStatus
);

router.get('/poojas', SuperController.listAllPoojas);
router.get('/occasions', SuperController.listAllOccasions);

router.get('/reports/platform', SuperController.getPlatformSummary);

export const superRoutes = router;
