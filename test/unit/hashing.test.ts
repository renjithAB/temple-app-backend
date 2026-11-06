import { describe, it, expect } from 'vitest';
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  hashPassword,
  verifyPassword,
} from '../../src/lib/hashing.js';

describe('Hashing & OTP Utilities', () => {
  it('should generate a 6-digit numeric OTP', () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
    const num = parseInt(code, 10);
    expect(num).toBeGreaterThanOrEqual(100000);
    expect(num).toBeLessThanOrEqual(999999);
  });

  it('should hash and verify OTP codes using timingSafeEqual', () => {
    const code = '748291';
    const hash = hashOtp(code);

    expect(hash).toHaveLength(64); // SHA-256 hex
    expect(verifyOtpHash(code, hash)).toBe(true);
    expect(verifyOtpHash('748292', hash)).toBe(false);
    expect(verifyOtpHash('000000', hash)).toBe(false);
  });

  it('should hash passwords using Argon2id and verify correctly', async () => {
    const plain = 'SuperSecret#2026';
    const hash = await hashPassword(plain);

    expect(hash).toContain('$argon2id$');
    const valid = await verifyPassword(hash, plain);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, 'WrongPassword');
    expect(invalid).toBe(false);
  });
});
