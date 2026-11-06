import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { otpRequestLimiter, authLimiter } from '../../middleware/rateLimit.js';
import {
  registerSchema,
  verifyEmailSchema,
  loginSchema,
  resendVerificationSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  otpRequestSchema,
  otpVerifySchema,
} from './auth.schema.js';

const router = Router();

// Devotee Registration & Verification
router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  AuthController.register
);

router.post(
  '/verify-email',
  authLimiter,
  validate({ body: verifyEmailSchema }),
  AuthController.verifyEmail
);

router.post(
  '/resend-verification',
  otpRequestLimiter,
  validate({ body: resendVerificationSchema }),
  AuthController.resendVerification
);

// Unified Login (Devotees, Staff, Super Admin)
router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  AuthController.login
);

// Forgot & Reset Password
router.post(
  '/forgot-password/request',
  otpRequestLimiter,
  validate({ body: forgotPasswordRequestSchema }),
  AuthController.forgotPasswordRequest
);

router.post(
  '/forgot-password/reset',
  authLimiter,
  validate({ body: forgotPasswordResetSchema }),
  AuthController.forgotPasswordReset
);

// Legacy routes for backwards compatibility
router.post(
  '/otp/request',
  otpRequestLimiter,
  validate({ body: otpRequestSchema }),
  AuthController.requestOtp
);

router.post(
  '/otp/verify',
  authLimiter,
  validate({ body: otpVerifySchema }),
  AuthController.verifyOtp
);

// Session management
router.post('/refresh', AuthController.refresh);
router.post('/logout', authenticate(), AuthController.logout);

export const authRoutes = router;
