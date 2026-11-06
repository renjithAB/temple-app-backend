import { env } from '../config/env.js';

function formatLog(level: string, arg1: any, arg2?: any): void {
  if (env.NODE_ENV === 'test') return;

  const timestamp = new Date().toISOString();
  let message = '';
  let meta: any = null;

  if (typeof arg1 === 'string') {
    message = arg1;
    if (arg2 !== undefined) {
      meta = arg2;
    }
  } else if (typeof arg1 === 'object' && arg1 !== null) {
    meta = arg1;
    message = typeof arg2 === 'string' ? arg2 : '';
  } else {
    message = String(arg1);
  }

  // Cloudflare Workers / Production logging
  if (env.NODE_ENV === 'production') {
    const logObj: any = {
      level,
      time: timestamp,
      msg: message,
    };
    if (meta) {
      Object.assign(logObj, meta);
    }
    const line = JSON.stringify(logObj);
    if (level === 'ERROR') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
    return;
  }

  // Development formatting
  const timeStr = timestamp.split('T')[1].replace('Z', ' UTC');
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';

  if (level === 'ERROR') {
    console.error(`[${timeStr}] ERROR: ${message}${metaStr}`);
  } else if (level === 'WARN') {
    console.warn(`[${timeStr}] WARN: ${message}${metaStr}`);
  } else if (level === 'DEBUG') {
    console.debug(`[${timeStr}] DEBUG: ${message}${metaStr}`);
  } else {
    console.log(`[${timeStr}] INFO: ${message}${metaStr}`);
  }
}

export const logger = {
  info: (arg1: any, arg2?: any) => formatLog('INFO', arg1, arg2),
  error: (arg1: any, arg2?: any) => formatLog('ERROR', arg1, arg2),
  warn: (arg1: any, arg2?: any) => formatLog('WARN', arg1, arg2),
  debug: (arg1: any, arg2?: any) => formatLog('DEBUG', arg1, arg2),
};

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [user, domain] = parts;
  if (!user || !domain) return '***';
  const maskedUser =
    user.length <= 2 ? user[0] + '***' : user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}
