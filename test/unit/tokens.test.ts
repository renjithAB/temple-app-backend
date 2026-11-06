import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../src/lib/tokens.js';

describe('Token Utilities', () => {
  it('should sign and verify Ed25519 access tokens with proper claims', async () => {
    const userId = '0192e210-6c9a-7b33-9123-456789abcdef';
    const role = 'DEVOTEE';

    const token = await signAccessToken(userId, role);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.role).toBe(role);
    expect(payload.iss).toBe('temple-platform');
    expect(payload.aud).toBe('temple-platform-clients');
  });

  it('should generate secure refresh tokens and deterministic SHA-256 hashes', () => {
    const { token, tokenHash } = generateRefreshToken();

    expect(token).toHaveLength(64); // 32 bytes hex
    expect(tokenHash).toHaveLength(64);
    expect(hashToken(token)).toBe(tokenHash);
  });
});
