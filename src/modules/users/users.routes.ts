import { Router } from 'express';
import { UsersController } from './users.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import {
  updateProfileSchema,
  familyMemberSchema,
  updateFamilyMemberSchema,
  familyMemberParamSchema,
  deviceTokenSchema,
  deviceTokenParamSchema,
} from './users.schema.js';

const router = Router();

// Profile endpoints (require authentication)
router.get('/me', authenticate(), UsersController.getProfile);
router.patch(
  '/me',
  authenticate(),
  validate({ body: updateProfileSchema }),
  UsersController.updateProfile
);
router.delete('/me', authenticate(), UsersController.deleteAccount);

// Saved family members
router.get('/me/family-members', authenticate(), UsersController.listFamilyMembers);
router.post(
  '/me/family-members',
  authenticate(),
  validate({ body: familyMemberSchema }),
  UsersController.createFamilyMember
);
router.patch(
  '/me/family-members/:id',
  authenticate(),
  validate({ params: familyMemberParamSchema, body: updateFamilyMemberSchema }),
  UsersController.updateFamilyMember
);
router.delete(
  '/me/family-members/:id',
  authenticate(),
  validate({ params: familyMemberParamSchema }),
  UsersController.deleteFamilyMember
);

// Device tokens
router.post(
  '/me/devices',
  authenticate(),
  validate({ body: deviceTokenSchema }),
  UsersController.registerDevice
);
router.delete(
  '/me/devices/:fcmToken',
  authenticate(),
  validate({ params: deviceTokenParamSchema }),
  UsersController.unregisterDevice
);

export const usersRoutes = router;
