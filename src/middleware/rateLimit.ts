import rateLimit, { MemoryStore } from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

/**
 * Cloudflare Workers Disallowed Operation fix:
 * The default MemoryStore in express-rate-limit sets up an active background timer
 * via `setInterval` inside `init()`. Cloudflare Workers strictly forbids any timers
 * (setTimeout, setInterval) or asynchronous I/O within the global/module scope.
 *
 * EdgeMemoryStore removes the global interval and purges expired client entries
 * lazily on incoming hits, keeping it 100% compliant with Cloudflare's isolate runtime.
 */
class EdgeMemoryStore extends MemoryStore {
  override init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
    // Intentionally no setInterval to prevent Disallowed Operation in Cloudflare Workers global scope.
  }

  override async increment(key: string) {
    if ((this as any).current?.size > 5000) {
      (this as any).clearExpired?.();
    }
    return super.increment(key);
  }
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  store: new EdgeMemoryStore(),
  validate: { trustProxy: false },
  handler: (req, res, next) => {
    next(AppError.rateLimited('Global request limit exceeded. Please try again shortly.'));
  },
});

export const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 per IP in 10 mins
  standardHeaders: true,
  legacyHeaders: false,
  store: new EdgeMemoryStore(),
  validate: { trustProxy: false },
  handler: (req, res, next) => {
    next(AppError.rateLimited('Too many OTP requests. Please wait 10 minutes.'));
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new EdgeMemoryStore(),
  validate: { trustProxy: false },
  handler: (req, res, next) => {
    next(AppError.rateLimited('Too many login attempts. Please wait 15 minutes.'));
  },
});

export const bookingCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 30, // max 30 attempts per IP/day
  standardHeaders: true,
  legacyHeaders: false,
  store: new EdgeMemoryStore(),
  validate: { trustProxy: false },
  handler: (req, res, next) => {
    next(AppError.rateLimited('Daily booking creation threshold reached.'));
  },
});
