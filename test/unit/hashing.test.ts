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

  it('should hash passwords using PBKDF2-HMAC-SHA256 and verify correctly', async () => {
    const plain = 'SuperSecret#2026';
    const hash = await hashPassword(plain);

    expect(hash).toMatch(/^\$pbkdf2\$v=1\$i=100000\$[0-9a-fA-F]{32}\$[0-9a-fA-F]{64}$/);
    const valid = await verifyPassword(hash, plain);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, 'WrongPassword');
    expect(invalid).toBe(false);
  });

  it('should strictly reject malformed PBKDF2 hashes', async () => {
    const plain = 'SuperSecret#2026';
    // Malformed iterations (e.g. with trailing chars)
    expect(await verifyPassword('$pbkdf2$v=1$i=100000abc$82e6c0f06159d56373acebecdf4badee$785e909d90ac10de6e8989bffe59456d9a17130ae3519e9135ed237a89d31e28', plain)).toBe(false);
    // Out-of-bounds iterations
    expect(await verifyPassword('$pbkdf2$v=1$i=100$82e6c0f06159d56373acebecdf4badee$785e909d90ac10de6e8989bffe59456d9a17130ae3519e9135ed237a89d31e28', plain)).toBe(false);
    expect(await verifyPassword('$pbkdf2$v=1$i=9999999$82e6c0f06159d56373acebecdf4badee$785e909d90ac10de6e8989bffe59456d9a17130ae3519e9135ed237a89d31e28', plain)).toBe(false);
  });

  it('should strictly bound and validate legacy Argon2 parameters against DoS', async () => {
    const plain = 'SuperSecret#2026';
    // Out-of-bounds memory DoS attempt
    expect(await verifyPassword('$argon2id$v=19$m=999999999,t=2,p=1$bPoqlmdDuXA1j0MEWDyIew$82jf7RLrlepDNVeyYpdXmUa4XyV9swjs3fjUNWzF+yE', plain)).toBe(false);
    // Malformed algorithm
    expect(await verifyPassword('$argon2xyz$v=19$m=19456,t=2,p=1$bPoqlmdDuXA1j0MEWDyIew$82jf7RLrlepDNVeyYpdXmUa4XyV9swjs3fjUNWzF+yE', plain)).toBe(false);
    // Out-of-bounds iterations
    expect(await verifyPassword('$argon2id$v=19$m=19456,t=50,p=1$bPoqlmdDuXA1j0MEWDyIew$82jf7RLrlepDNVeyYpdXmUa4XyV9swjs3fjUNWzF+yE', plain)).toBe(false);
  });
});
