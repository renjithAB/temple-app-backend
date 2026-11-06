import crypto from 'crypto';

// Unambiguous alphanumeric characters (excluding 0/O, 1/I/L)
const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateBookingCode(prefix = 'TMP'): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[bytes[i] % CHARS.length];
  }
  return `${prefix}-${code}`;
}
