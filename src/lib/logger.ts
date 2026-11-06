import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact:
    env.NODE_ENV === 'production'
      ? {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'headers.authorization',
            'headers.cookie',
            'password',
            'passwordHash',
            'token',
            'refreshToken',
            'code',
            'otp',
          ],
          censor: '[REDACTED]',
        }
      : {
          paths: [
            'req.headers.authorization',
            'headers.authorization',
            'password',
            'passwordHash',
          ],
          censor: '[REDACTED]',
        },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [user, domain] = parts;
  if (!user || !domain) return '***';
  const maskedUser =
    user.length <= 2 ? user[0] + '***' : user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}
