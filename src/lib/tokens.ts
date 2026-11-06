import crypto from 'crypto';
import * as jose from 'jose';
import { env } from '../config/env.js';
import { APP_CONSTANTS } from '../config/constants.js';

let keyPair: { privateKey: jose.KeyLike | Uint8Array; publicKey: jose.KeyLike | Uint8Array };

// Initialize or dynamically generate Ed25519 keys
async function getKeys() {
  if (keyPair) return keyPair;

  if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
    const privateKey = await jose.importPKCS8(env.JWT_PRIVATE_KEY, 'EdDSA');
    const publicKey = await jose.importSPKI(env.JWT_PUBLIC_KEY, 'EdDSA');
    keyPair = { privateKey, publicKey };
  } else {
    // Generate in-memory Ed25519 key pair for dev/test when not provided in env
    keyPair = await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' });
  }

  return keyPair;
}

export interface AccessTokenPayload {
  sub: string;
  role: string;
  [key: string]: unknown;
}

export async function signAccessToken(userId: string, role: string): Promise<string> {
  const { privateKey } = await getKeys();
  const jti = crypto.randomUUID();

  return await new jose.SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(APP_CONSTANTS.AUTH.ACCESS_TOKEN_EXPIRY)
    .setJti(jti)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { publicKey } = await getKeys();
  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ['EdDSA'],
  });

  return {
    sub: payload.sub as string,
    role: payload.role as string,
    ...payload,
  };
}

export function generateRefreshToken(): { token: string; tokenHash: string } {
  // Random 256-bit (32 bytes) token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
