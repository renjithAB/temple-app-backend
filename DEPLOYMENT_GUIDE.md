# Temple Platform - Cloudflare Workers & D1 Deployment Guide

This document provides a complete, step-by-step production deployment guide for running the **Temple Platform Backend** on **Cloudflare Workers** using **Cloudflare D1** (Serverless SQLite at the Edge).

---

## 🏗️ Architecture Overview

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Compute** | Cloudflare Workers | Edge serverless execution with `nodejs_compat` |
| **Database** | Cloudflare D1 | Distributed SQLite database at the edge |
| **ORM** | Prisma Client with `@prisma/adapter-d1` | Type-safe database queries |
| **Storage** | Cloudinary or Cloudflare R2 | High-resolution temple photos and festival media |
| **Cron Jobs** | Cloudflare Cron Triggers | Nightly slot inventory generation & hourly reminders |
| **Client** | React Native Expo Mobile App | Connects directly via HTTPS |

---

## 📋 Prerequisites

1. **Cloudflare Account**: [Sign up for a free or paid Cloudflare account](https://dash.cloudflare.com/sign-up).
2. **Node.js**: v18.0.0 or higher installed locally.
3. **Wrangler CLI**: Cloudflare's official command-line developer tool.

---

## 🚀 Step-by-Step Deployment Instructions

### Step 1: Install Cloudflare Worker & D1 Dependencies

Navigate into the `backend/` directory and install the Prisma D1 adapter along with Wrangler:

```bash
cd backend
npm install @prisma/adapter-d1
npm install -D wrangler @cloudflare/workers-types
```

---

### Step 2: Enable Driver Adapters in Prisma

Open `backend/prisma/schema.prisma` and add `previewFeatures = ["driverAdapters"]` inside the `generator client` block:

```prisma
generator client {
  provider        = "prisma-client-js"
  output          = "../src/generated/prisma"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Regenerate your local Prisma Client:

```bash
npx prisma generate
```

---

### Step 3: Create Your Cloudflare D1 Database

Authenticate with Cloudflare and create your production database:

```bash
# 1. Log in to your Cloudflare account
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create temple-platform-db
```

Wrangler will print output similar to:

```text
✅ Successfully created DB 'temple-platform-db'

[[d1_databases]]
binding = "DB"
database_name = "temple-platform-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> **Important**: Copy your `database_id`. You will need it in the next step.

---

### Step 4: Create `wrangler.jsonc` (Worker Configuration)

In the `backend/` root directory, create a `wrangler.jsonc` file:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "temple-platform-backend",
  "main": "src/worker.ts",
  "compatibility_date": "2024-11-01",
  "compatibility_flags": ["nodejs_compat"],

  // Cloudflare D1 Database Binding
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "temple-platform-db",
      "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID",
      "migrations_dir": "migrations"
    }
  ],

  // Automated Background Cron Triggers (replaces Node.js setInterval)
  "triggers": {
    "crons": [
      "5 0 * * *",  // Nightly at 00:05 UTC (generate slot inventory)
      "0 * * * *"   // Hourly (booking reminder notifications)
    ]
  },

  // Public Environment Variables
  "vars": {
    "NODE_ENV": "production",
    "EMAIL_PROVIDER": "brevo",
    "EMAIL_FROM": "noreply@templeplatform.org",
    "CORS_ORIGINS": "https://your-frontend-domain.com,http://localhost:19006"
  }
}
```

---

### Step 5: Adapt Prisma Client for D1 Runtime

In `backend/src/db/prisma.ts`, configure Prisma to support both local SQLite and Cloudflare D1 with automatic switching:

```ts
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaD1 } from '@prisma/adapter-d1';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

let activeClient: PrismaClient | null = null;

function createLocalClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: { url: env.DATABASE_URL || 'file:./dev.db' },
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

  return client;
}

export function setD1Database(d1Database: any): PrismaClient {
  const adapter = new PrismaD1(d1Database);
  activeClient = new PrismaClient({ adapter });
  return activeClient;
}

export function getPrismaClient(d1Database?: any): PrismaClient {
  if (d1Database) {
    return setD1Database(d1Database);
  }
  if (!activeClient) {
    activeClient = createLocalClient();
  }
  return activeClient;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});
```

---

### Step 6: Create the Worker Entry Point (`src/worker.ts`)

Create `backend/src/worker.ts` using Cloudflare's official `handleAsNodeRequest` adapter:

```ts
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './app.js';
import { setD1Database } from './db/prisma.js';
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

function initEnvironment(env: any) {
  if (env && typeof env === 'object') {
    for (const [key, val] of Object.entries(env)) {
      if (typeof val === 'string' && !process.env[key]) {
        process.env[key] = val;
      }
    }
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
        { status: 500, headers: { 'Content-Type': 'application/json' } }
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
```

---

### Step 7: Push & Apply Migrations to Cloudflare D1

Because your migrations in `prisma/migrations/` are pure SQLite, deploy them directly via Wrangler:

```bash
# 1. (Optional) Test locally against local D1 simulator
npx wrangler d1 migrations apply temple-platform-db --local

# 2. Apply migrations to the live Cloudflare D1 production database
npx wrangler d1 migrations apply temple-platform-db --remote
```

---

### Step 8: Set Production Secrets in Cloudflare

Never store private credentials in code or version control. Store them using Wrangler Secrets:

```bash
npx wrangler secret put JWT_PRIVATE_KEY
npx wrangler secret put JWT_PUBLIC_KEY
npx wrangler secret put OTP_HMAC_SECRET
npx wrangler secret put QR_SIGNING_SECRET
npx wrangler secret put BREVO_SMTP_USER
npx wrangler secret put BREVO_SMTP_KEY
npx wrangler secret put CLOUDINARY_URL
```

*(Wrangler will securely prompt you to type or paste each value)*.

---

### Step 9: Deploy to Cloudflare Workers

Deploy your live backend worker:

```bash
npx wrangler deploy
```

Upon completion, Wrangler will provide your live deployment URL:

```text
Uploaded temple-platform-backend (2.8 sec)
Published temple-platform-backend (0.6 sec)
  https://temple-platform-backend.<your-subdomain>.workers.dev
```

Test your deployment health check:

```bash
curl https://temple-platform-backend.<your-subdomain>.workers.dev/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-11-06T19:00:00.000Z"}
```

---

### Step 10: Connect Your Mobile App

Open `mobile/.env` and update your API URL to point to the Cloudflare Worker URL:

```env
API_BASE_URL="https://temple-platform-backend.<your-subdomain>.workers.dev"
```

Restart your Expo dev client:

```bash
cd mobile
npx expo start -c
```

---

## 🔒 Production Verification Checklist

- [ ] **Database Connection**: `ready` endpoint returns `{"status":"ready","database":"connected"}`.
- [ ] **CORS**: `CORS_ORIGINS` in `wrangler.jsonc` matches your web/mobile domain.
- [ ] **Image Uploads**: `CLOUDINARY_URL` secret is set so uploads save to the cloud rather than an ephemeral worker disk.
- [ ] **Email OTP**: `BREVO_SMTP_KEY` and `BREVO_SMTP_USER` are configured for delivery of 6-digit verification codes.
- [ ] **Cron Triggers**: Check the Cloudflare Dashboard under **Workers & Pages > Triggers** to verify scheduled tasks are active.

