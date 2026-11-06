import { z } from 'zod';

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),
    language: z.string().trim().max(10).optional(),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'OTP code must be exactly 6 digits'),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
  })
  .strict();

export const forgotPasswordRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
  })
  .strict();

export const forgotPasswordResetSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'OTP code must be exactly 6 digits'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),
  })
  .strict();

export const otpRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
  })
  .strict();

export const otpVerifySchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Invalid email address format')
      .max(255),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'OTP code must be exactly 6 digits'),
  })
  .strict();

export const superAdminLoginSchema = loginSchema;

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().trim().min(1, 'Refresh token is required'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>;
export type ForgotPasswordResetInput = z.infer<typeof forgotPasswordResetSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type SuperAdminLoginInput = z.infer<typeof superAdminLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
