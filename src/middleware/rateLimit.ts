import rateLimit from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(AppError.rateLimited('Global request limit exceeded. Please try again shortly.'));
  },
});

export const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 per IP in 10 mins
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(AppError.rateLimited('Too many OTP requests. Please wait 10 minutes.'));
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(AppError.rateLimited('Too many login attempts. Please wait 15 minutes.'));
  },
});

export const bookingCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 30, // max 30 attempts per IP/day
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(AppError.rateLimited('Daily booking creation threshold reached.'));
  },
});
