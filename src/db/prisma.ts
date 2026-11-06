import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaD1 } from '@prisma/adapter-d1';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

let activeClient: PrismaClient | null = null;

/**
 * Creates a standard PrismaClient for local development (SQLite / dev.db).
 */
function createLocalClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL || 'file:./dev.db',
      },
    },
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

  if (env.NODE_ENV === 'development') {
    client.$on('query' as never, (e: { query: string; duration: number }) => {
      logger.debug({ query: e.query, durationMs: e.duration }, 'Database query executed');
    });
  }

  client.$on('error' as never, (e: { message: string }) => {
    logger.error({ error: e.message }, 'Database error occurred');
  });

  return client;
}

/**
 * Switch or initialize Prisma to use Cloudflare D1 adapter.
 * Call this in your Cloudflare Worker fetch handler with `env.DB`.
 */
export function setD1Database(d1Database: any): PrismaClient {
  const adapter = new PrismaD1(d1Database);
  activeClient = new PrismaClient({ adapter });
  return activeClient;
}

/**
 * Resolves the active PrismaClient instance.
 * - When passed a Cloudflare D1 database binding, initializes Prisma with `@prisma/adapter-d1`.
 * - Defaults to local SQLite if running in local development without D1.
 */
export function getPrismaClient(d1Database?: any): PrismaClient {
  if (d1Database) {
    return setD1Database(d1Database);
  }
  if (!activeClient) {
    activeClient = createLocalClient();
  }
  return activeClient;
}

/**
 * Universal exported `prisma` singleton.
 * Uses an ES6 Proxy so any existing `import { prisma } from '...'` seamlessly
 * delegates to either the local SQLite database or the Cloudflare D1 instance.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});
