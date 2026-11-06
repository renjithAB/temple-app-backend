import crypto from 'crypto';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { env } from '../config/env.js';

// Configuration adhering to RFC 9106 & OWASP while respecting Cloudflare Worker CPU limits
const ARGON2_CONFIG = {
  t: 2, // 2 iterations
  m: 19456, // 19 MiB
  p: 1, // parallelism
  dkLen: 32, // 32-byte digest
};

function base64ToBuffer(b64: string): Buffer {
  const pad = b64.length % 4;
  const normalized = pad === 0 ? b64 : b64 + '='.repeat(4 - pad);
  return Buffer.from(normalized, 'base64');
}

/**
 * Hashes a plaintext password using pure-JavaScript Argon2id (RFC 9106).
 * Compatible with all runtimes (Cloudflare Workers, Node.js, Edge) with zero native C++ binaries.
 * Output follows standard PHC string format: $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derivedKey = await argon2idAsync(password, salt, {
    t: ARGON2_CONFIG.t,
    m: ARGON2_CONFIG.m,
    p: ARGON2_CONFIG.p,
    dkLen: ARGON2_CONFIG.dkLen,
  });

  const saltB64 = Buffer.from(salt).toString('base64').replace(/=+$/, '');
  const hashB64 = Buffer.from(derivedKey).toString('base64').replace(/=+$/, '');

  return `$argon2id$v=19$m=${ARGON2_CONFIG.m},t=${ARGON2_CONFIG.t},p=${ARGON2_CONFIG.p}$${saltB64}$${hashB64}`;
}

/**
 * Verifies a plaintext password against an Argon2 / Argon2id PHC string.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    if (!storedHash || !storedHash.startsWith('$argon2')) {
      return false;
    }

    // Split PHC format: ["", "argon2id", "v=19", "m=...,t=...,p=...", "salt", "hash"]
    const parts = storedHash.split('$').filter(Boolean);
    if (parts.length < 4) {
      return false;
    }

    let paramPartIndex = 1;
    if (parts[1].startsWith('v=')) {
      paramPartIndex = 2;
    }

    const paramsStr = parts[paramPartIndex];
    const saltStr = parts[paramPartIndex + 1];
    const hashStr = parts[paramPartIndex + 2];

    if (!paramsStr || !saltStr || !hashStr) {
      return false;
    }

    const params: { t?: number; m?: number; p?: number } = {};
    for (const pair of paramsStr.split(',')) {
      const [k, v] = pair.split('=');
      if (k && v) {
        params[k as 't' | 'm' | 'p'] = parseInt(v, 10);
      }
    }

    const salt = base64ToBuffer(saltStr);
    const expectedHash = base64ToBuffer(hashStr);

    const testDerivedKey = await argon2idAsync(plain, salt, {
      t: params.t || ARGON2_CONFIG.t,
      m: params.m || ARGON2_CONFIG.m,
      p: params.p || ARGON2_CONFIG.p,
      dkLen: expectedHash.length,
    });

    const testBuffer = Buffer.from(testDerivedKey);
    if (testBuffer.length !== expectedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(testBuffer, expectedHash);
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
