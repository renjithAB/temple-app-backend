import crypto from 'crypto';
import { env } from '../config/env.js';

export interface QrPayloadData {
  bId: string; // booking ID
  tId: string; // templeId
  ts: number;  // timestamp of creation
}

export function generateQrPayload(bookingId: string, templeId: string): string {
  const data: QrPayloadData = {
    bId: bookingId,
    tId: templeId,
    ts: Date.now(),
  };

  const serialized = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.QR_SIGNING_SECRET)
    .update(serialized)
    .digest('base64url');

  return `${serialized}.${signature}`;
}

export function verifyQrPayload(qrString: string): QrPayloadData | null {
  const parts = qrString.split('.');
  if (parts.length !== 2) return null;

  const [serialized, receivedSignature] = parts;
  if (!serialized || !receivedSignature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', env.QR_SIGNING_SECRET)
    .update(serialized)
    .digest('base64url');

  const bufA = Buffer.from(receivedSignature);
  const bufB = Buffer.from(expectedSignature);

  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(serialized, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr) as QrPayloadData;
    if (!data.bId || !data.tId) return null;
    return data;
  } catch {
    return null;
  }
}
