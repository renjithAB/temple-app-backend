import { describe, it, expect } from 'vitest';
import { generateQrPayload, verifyQrPayload } from '../../src/lib/qr.js';

describe('QR Payload & Check-in Verification', () => {
  it('should generate an HMAC signed QR payload and verify successfully', () => {
    const bookingId = '0192e210-6c9a-7b33-9123-456789abcdef';
    const templeId = '0192e210-6c9a-7b33-9123-111111111111';

    const payload = generateQrPayload(bookingId, templeId);
    expect(payload).toContain('.');

    const verified = verifyQrPayload(payload);
    expect(verified).not.toBeNull();
    expect(verified?.bId).toBe(bookingId);
    expect(verified?.tId).toBe(templeId);
    expect(typeof verified?.ts).toBe('number');
  });

  it('should reject tampered or corrupt QR payloads', () => {
    const bookingId = '0192e210-6c9a-7b33-9123-456789abcdef';
    const templeId = '0192e210-6c9a-7b33-9123-111111111111';

    const validPayload = generateQrPayload(bookingId, templeId);
    const [body, sig] = validPayload.split('.');

    // Tamper body
    const tamperedPayload = `eyIxMjMiOiJmb28ifQ.${sig}`;
    expect(verifyQrPayload(tamperedPayload)).toBeNull();

    // Tamper signature
    const invalidSigPayload = `${body}.invalidsignature123`;
    expect(verifyQrPayload(invalidSigPayload)).toBeNull();

    // Invalid format
    expect(verifyQrPayload('not-a-valid-payload')).toBeNull();
  });
});
