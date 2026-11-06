import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { emailService } from '../../integrations/email/index.js';
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  hashPassword,
  verifyPassword,
} from '../../lib/hashing.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../lib/tokens.js';
import { AppError } from '../../lib/errors.js';
import { APP_CONSTANTS } from '../../config/constants.js';
import { GlobalRole } from '../../generated/prisma/index.js';
import { logger } from '../../lib/logger.js';
import {
  RegisterInput,
  ForgotPasswordResetInput,
} from './auth.schema.js';
import { env } from '../../config/env.js';

export class AuthService {
  /**
   * Devotee Registration:
   * Registers a devotee with email, name, phone, password.
   * Account is created with isEmailVerified = false.
   * Sends a 6-digit verification code to the email.
   */
  static async register(input: RegisterInput): Promise<{ message: string; email: string; devOtp?: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check rate limit: at most 5 register attempts in 10 minutes for this email
    const tenMinutesAgo = new Date(
      Date.now() - APP_CONSTANTS.AUTH.OTP_WINDOW_MINUTES * 60 * 1000
    );
    const recentRequestsCount = await prisma.otpCode.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentRequestsCount >= APP_CONSTANTS.AUTH.OTP_REQUEST_LIMIT_PER_WINDOW + 2) {
      throw AppError.rateLimited('Too many requests. Please wait 10 minutes.');
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const passwordHash = await hashPassword(input.password);

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        throw AppError.conflict(
          'An account with this email address already exists. Please log in directly.'
        );
      }

      // If user started registration before but never verified, update details and resend code
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          passwordHash,
          language: input.language?.trim() || existingUser.language || 'en',
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name: input.name.trim(),
          email: normalizedEmail,
          phone: input.phone?.trim() || null,
          passwordHash,
          role: GlobalRole.DEVOTEE,
          isEmailVerified: false,
          language: input.language?.trim() || 'en',
          isActive: true,
        },
      });
    }

    // Invalidate previous unconsumed verification OTP codes for this email
    await prisma.otpCode.updateMany({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        purpose: 'VERIFY',
      },
      data: {
        consumedAt: new Date(),
      },
    });

    // Generate fresh OTP
    const plainCode = generateOtp();
    const codeHash = hashOtp(plainCode);
    const expiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000
    );

    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        purpose: 'VERIFY',
        expiresAt,
      },
    });

    // Send code via email
    await emailService.sendOtp(normalizedEmail, plainCode, 'VERIFY');

    return {
      message: 'Registration successful! A 6-digit verification code has been sent to your email.',
      email: normalizedEmail,
      devOtp: env.NODE_ENV === 'development' ? plainCode : undefined,
    };
  }

  /**
   * Verify Devotee Email with OTP:
   * Sets isEmailVerified = true and returns access + refresh tokens.
   */
  static async verifyEmail(
    email: string,
    plainCode: string,
    userAgent?: string
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        staffRoles: {
          include: {
            temple: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User account not found with this email address');
    }

    // Find latest unused verification code
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        purpose: { in: ['VERIFY', 'VERIFICATION'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new AppError('INVALID_OTP', 400, 'Invalid or expired verification code');
    }

    // Check expiry
    if (new Date() > otpRecord.expiresAt) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      });
      throw new AppError('OTP_EXPIRED', 400, 'Verification code has expired. Please request a new one.');
    }

    // Check attempts limit (max 5)
    if (otpRecord.attempts >= APP_CONSTANTS.AUTH.OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      });
      throw new AppError('OTP_MAX_ATTEMPTS', 400, 'Too many invalid attempts. Please request a new code.');
    }

    // Increment attempt counter
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    // Verify hash
    const isValid = verifyOtpHash(plainCode, otpRecord.codeHash);
    if (!isValid) {
      throw new AppError('INVALID_OTP', 400, 'Invalid verification code');
    }

    // Mark OTP consumed immediately
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    // Update user: mark verified and record login
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    if (!updatedUser.isActive) {
      throw AppError.forbidden('User account is suspended');
    }

    // Issue tokens and create session family
    const familyId = crypto.randomUUID();
    const { token: refreshToken, tokenHash } = generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.refreshSession.create({
      data: {
        userId: updatedUser.id,
        familyId,
        tokenHash,
        userAgent,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await signAccessToken(updatedUser.id, updatedUser.role);

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        language: updatedUser.language,
        isEmailVerified: true,
        staffRoles: user.staffRoles,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresInSeconds: 15 * 60,
      },
    };
  }

  /**
   * Unified Login with Email and Password:
   * Works for Devotees, Staff, and Admins.
   * Strictly enforces that devotees must be email-verified before accessing the platform.
   */
  static async login(
    email: string,
    passwordPlain: string,
    userAgent?: string
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        staffRoles: {
          include: {
            temple: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (60 * 1000)
      );
      throw new AppError(
        'ACCOUNT_LOCKED',
        403,
        `Account is locked due to repeated failed logins. Please try again in ${waitMinutes} minutes.`
      );
    }

    // Verify password with Argon2
    const passwordMatch = await verifyPassword(user.passwordHash, passwordPlain);
    if (!passwordMatch) {
      const failedCount = user.failedLogins + 1;
      const shouldLock = failedCount >= APP_CONSTANTS.AUTH.MAX_PASSWORD_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + APP_CONSTANTS.AUTH.LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failedCount,
          lockedUntil,
        },
      });

      throw AppError.unauthorized('Invalid email or password');
    }

    // Mandatory email verification check for DEVOTEE
    if (user.role === GlobalRole.DEVOTEE && !user.isEmailVerified) {
      // Invalidate previous verification codes
      await prisma.otpCode.updateMany({
        where: {
          email: normalizedEmail,
          consumedAt: null,
          purpose: 'VERIFY',
        },
        data: { consumedAt: new Date() },
      });

      // Generate a fresh verification code
      const plainCode = generateOtp();
      const codeHash = hashOtp(plainCode);
      const expiresAt = new Date(
        Date.now() + APP_CONSTANTS.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000
      );

      await prisma.otpCode.create({
        data: {
          email: normalizedEmail,
          codeHash,
          purpose: 'VERIFY',
          expiresAt,
        },
      });

      await emailService.sendOtp(normalizedEmail, plainCode, 'VERIFY');

      throw AppError.emailNotVerified(
        `Please verify your email address to continue. Verification code: ${env.NODE_ENV === 'development' ? plainCode : 'sent to your email'}.`,
        { email: user.email, devOtp: env.NODE_ENV === 'development' ? plainCode : undefined }
      );
    }

    if (!user.isActive) {
      throw AppError.forbidden('User account is suspended');
    }

    // Reset failed logins
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Issue tokens and create session family
    const familyId = crypto.randomUUID();
    const { token: refreshToken, tokenHash } = generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        userAgent,
        expiresAt: refreshExpiresAt,
      },
    });

    const accessToken = await signAccessToken(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        language: user.language,
        isEmailVerified: user.isEmailVerified,
        staffRoles: user.staffRoles,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresInSeconds: 15 * 60,
      },
    };
  }

  /**
   * Resend Verification Code:
   */
  static async resendVerification(email: string): Promise<{ message: string; devOtp?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Check rate limit: at most 3 requests in 10 minutes for this email
    const tenMinutesAgo = new Date(
      Date.now() - APP_CONSTANTS.AUTH.OTP_WINDOW_MINUTES * 60 * 1000
    );
    const recentRequestsCount = await prisma.otpCode.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentRequestsCount >= APP_CONSTANTS.AUTH.OTP_REQUEST_LIMIT_PER_WINDOW) {
      throw AppError.rateLimited('Too many OTP requests. Please wait 10 minutes.');
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw AppError.notFound('No account found with this email address');
    }

    if (user.isEmailVerified) {
      return { message: 'Your email address is already verified. You can log in directly.' };
    }

    // Invalidate previous unused codes
    await prisma.otpCode.updateMany({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        purpose: 'VERIFY',
      },
      data: { consumedAt: new Date() },
    });

    // Generate new code
    const plainCode = generateOtp();
    const codeHash = hashOtp(plainCode);
    const expiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000
    );

    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        purpose: 'VERIFY',
        expiresAt,
      },
    });

    await emailService.sendOtp(normalizedEmail, plainCode, 'VERIFY');

    return {
      message: 'A fresh 6-digit verification code has been sent to your email.',
      devOtp: env.NODE_ENV === 'development' ? plainCode : undefined,
    };
  }

  /**
   * Request Password Reset OTP:
   */
  static async forgotPasswordRequest(email: string): Promise<{ message: string; devOtp?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Check rate limit
    const tenMinutesAgo = new Date(
      Date.now() - APP_CONSTANTS.AUTH.OTP_WINDOW_MINUTES * 60 * 1000
    );
    const recentRequestsCount = await prisma.otpCode.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentRequestsCount >= APP_CONSTANTS.AUTH.OTP_REQUEST_LIMIT_PER_WINDOW) {
      throw AppError.rateLimited('Too many password reset requests. Please wait 10 minutes.');
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Return generic message even if user not found to prevent email enumeration
    if (!user) {
      return {
        message: 'If an account exists with this email, a 6-digit password reset code has been sent.',
      };
    }

    // Invalidate previous password reset OTPs
    await prisma.otpCode.updateMany({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        purpose: 'FORGOT_PASSWORD',
      },
      data: { consumedAt: new Date() },
    });

    // Generate OTP
    const plainCode = generateOtp();
    const codeHash = hashOtp(plainCode);
    const expiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.OTP_EXPIRY_MINUTES * 60 * 1000
    );

    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        purpose: 'FORGOT_PASSWORD',
        expiresAt,
      },
    });

    await emailService.sendOtp(normalizedEmail, plainCode, 'FORGOT_PASSWORD');

    return {
      message: 'If an account exists with this email, a 6-digit password reset code has been sent.',
      devOtp: env.NODE_ENV === 'development' ? plainCode : undefined,
    };
  }

  /**
   * Reset Password with OTP:
   */
  static async forgotPasswordReset(input: ForgotPasswordResetInput): Promise<{ message: string }> {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw AppError.notFound('User account not found');
    }

    // Find latest unused forgot password code
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        purpose: 'FORGOT_PASSWORD',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new AppError('INVALID_OTP', 400, 'Invalid or expired password reset code');
    }

    // Check expiry
    if (new Date() > otpRecord.expiresAt) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      });
      throw new AppError('OTP_EXPIRED', 400, 'Password reset code has expired. Please request a new one.');
    }

    // Check attempts limit
    if (otpRecord.attempts >= APP_CONSTANTS.AUTH.OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      });
      throw new AppError('OTP_MAX_ATTEMPTS', 400, 'Too many invalid attempts. Please request a new code.');
    }

    // Increment attempts
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    // Verify hash
    const isValid = verifyOtpHash(input.code, otpRecord.codeHash);
    if (!isValid) {
      throw new AppError('INVALID_OTP', 400, 'Invalid password reset code');
    }

    // Mark OTP consumed
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    // Hash new password
    const newPasswordHash = await hashPassword(input.newPassword);

    // Update user: update password, reset failed logins, and mark email verified if not already
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        failedLogins: 0,
        lockedUntil: null,
        isEmailVerified: true,
        emailVerifiedAt: user.emailVerifiedAt || new Date(),
      },
    });

    // Invalidate existing sessions for security
    await prisma.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return {
      message: 'Password has been reset successfully! You can now log in with your new password.',
    };
  }

  /**
   * Legacy / backward compatibility: Super Admin direct login
   */
  static async loginSuperAdmin(
    email: string,
    passwordPlain: string,
    userAgent?: string
  ) {
    return this.login(email, passwordPlain, userAgent);
  }

  /**
   * Legacy passwordless OTP request
   */
  static async requestOtp(email: string): Promise<{ message: string }> {
    return this.resendVerification(email);
  }

  /**
   * Legacy passwordless OTP verify
   */
  static async verifyOtp(
    email: string,
    plainCode: string,
    userAgent?: string
  ) {
    return this.verifyEmail(email, plainCode, userAgent);
  }

  /**
   * Token refresh
   */
  static async refresh(refreshToken: string, userAgent?: string) {
    const tokenHash = hashToken(refreshToken.trim());

    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    // Section 8 Theft Detection:
    if (session.usedAt || session.revokedAt) {
      logger.warn(
        { familyId: session.familyId, userId: session.userId },
        '🚨 Refresh token reuse detected! Revoking token family.'
      );
      await prisma.refreshSession.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      throw AppError.unauthorized('Token reuse detected. All sessions in this family have been revoked.');
    }

    // Check expiry
    if (new Date() > session.expiresAt) {
      await prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw AppError.unauthorized('Refresh token has expired');
    }

    // Verify user is active
    if (!session.user.isActive) {
      throw AppError.unauthorized('User account has been deactivated');
    }

    // Mark current session as used
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });

    // Create rotated refresh token within the same family
    const { token: newRefreshToken, tokenHash: newHash } = generateRefreshToken();
    const newExpiresAt = new Date(
      Date.now() + APP_CONSTANTS.AUTH.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.refreshSession.create({
      data: {
        userId: session.userId,
        familyId: session.familyId,
        tokenHash: newHash,
        userAgent,
        expiresAt: newExpiresAt,
      },
    });

    const accessToken = await signAccessToken(session.user.id, session.user.role);

    return {
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresInSeconds: 15 * 60,
      },
    };
  }

  /**
   * Logout
   */
  static async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken.trim());
      await prisma.refreshSession.updateMany({
        where: { userId, tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      await prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { message: 'Logged out successfully' };
  }
}
