import crypto from 'crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';
import { APP_CONSTANTS } from '../config/constants.js';

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function generateOtp(): string {
  // 6-digit cryptographic random number
  const min = 100000;
  const max = 999999;
  return crypto.randomInt(min, max + 1).toString();
}

export function hashOtp(code: string): string {
  return crypto
    .createHmac('sha256', env.OTP_HMAC_SECRET)
    .update(code.trim())
    .digest('hex');
}

export function verifyOtpHash(plainCode: string, storedHash: string): boolean {
  const computedHash = hashOtp(plainCode);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
