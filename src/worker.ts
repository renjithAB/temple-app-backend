// Ensure CommonJS path globals exist in edge isolate environments
if (typeof (globalThis as any).__dirname === 'undefined') {
  (globalThis as any).__dirname = '/';
}
if (typeof (globalThis as any).__filename === 'undefined') {
  (globalThis as any).__filename = '/worker.js';
}

import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './app.js';
import { setD1Database } from './db/prisma.js';
import { refreshEnv } from './config/env.js';
import { JobTasks } from './jobs/tasks.js';

const PORT = 8080;
let serverInitialized = false;

function ensureServer() {
  if (!serverInitialized) {
    const app = createApp();
    app.listen(PORT);
    serverInitialized = true;
  }
}

/**
 * Propagates Cloudflare Worker secrets and bindings into process.env
 * so standard libraries and configuration can read them transparently.
 */
function initEnvironment(env: any) {
  if (env && typeof env === 'object') {
    for (const [key, val] of Object.entries(env)) {
      if (typeof val === 'string') {
        process.env[key] = val;
      }
    }
    refreshEnv();
  }

  if (env?.DB) {
    setD1Database(env.DB);
  }
}

export default {
  // Handles incoming HTTPS requests on Cloudflare Workers
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    try {
      initEnvironment(env);
      ensureServer();
      return await handleAsNodeRequest(PORT, request);
    } catch (err: any) {
      console.error('Worker execution error:', err);
      return new Response(
        JSON.stringify({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: err?.message || 'Internal Worker Error',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },

  // Handles scheduled Cron Triggers for background jobs
  async scheduled(event: any, env: any, ctx: any) {
    initEnvironment(env);

    ctx.waitUntil(
      (async () => {
        try {
          if (event.cron === '5 0 * * *') {
            await JobTasks.generateSlotInventory();
            await JobTasks.completePastBookings();
            await JobTasks.cleanup();
          } else if (event.cron === '0 * * * *') {
            await JobTasks.bookingReminders();
          }
        } catch (err) {
          console.error('Scheduled job error:', err);
        }
      })()
    );
  },
};
