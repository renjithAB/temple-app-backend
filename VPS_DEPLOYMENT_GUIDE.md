# Temple Platform - Complete VPS Deployment & Migration Guide

This guide provides a comprehensive, production-grade manual for deploying the **Temple Platform Backend** on a standard **Linux VPS (Ubuntu 22.04 / 24.04 LTS)** using **Node.js, PostgreSQL, PM2/Docker, Nginx, and native server-side Image Optimization**.

It outlines the exact architectural differences between the Cloudflare Workers edge build and a full Linux server, detailing required package updates, native image processing, database migration, and complete server provisioning steps.

---

## 🏗️ Architecture Comparison: Edge vs. Linux VPS

| Component | Cloudflare Workers (Edge) | Linux VPS (Traditional Server) | Advantage of VPS Deployment |
| :--- | :--- | :--- | :--- |
| **Runtime** | V8 Isolate (`workerd`) | Full Node.js 22/24 LTS | Native C/C++ bindings, direct OS APIs, zero sandbox constraints |
| **Database** | Cloudflare D1 (SQLite at edge) | PostgreSQL 16 or 18 | ACID transactions, rich JSONB indexing, concurrency, row-level locking |
| **Image Processing** | Passthrough via Cloudinary | Native `sharp` (libvips C++) | **Zero cloud costs**, automated EXIF/GPS stripping, WebP/AVIF auto-transcoding |
| **Password Hashing** | Pure JS `@noble/hashes` | Native `argon2` (C++ SIMD) | **10x–40x faster** multi-threaded hashing; does not block the Node.js event loop |
| **Media Storage** | Cloudinary / Cloudflare R2 | Local NVMe SSD or MinIO / S3 | High-speed local disk I/O, Nginx direct static delivery with caching headers |
| **Process Model** | Ephemeral serverless requests | Persistent Node process | Connection pooling, persistent in-memory caching, WebSockets |
| **Background Jobs** | Cloudflare Cron Triggers | `pg-boss` or systemd cron | Dedicated workers, retries, dead-letter queues, priority scheduling |
| **Reverse Proxy** | Cloudflare Edge Network | Nginx / Caddy + Certbot | Full control over SSL ciphers, rate limiting, gzip/brotli, upload limits |

---

## 📦 Package Changes Breakdown

When running on a native VPS, you have access to Linux binaries and native build tools (`node-gyp`). You can reintroduce high-performance native modules that were stripped for edge isolates.

### 1. Dependencies to Install for VPS

Run these commands inside the `backend/` directory:

```bash
# 1. Native Image Optimization (C++ libvips binding)
npm install sharp
npm install -D @types/sharp

# 2. Native Multi-Threaded Argon2id Password Hashing
npm install argon2

# 3. PostgreSQL Database Client (for Prisma native connection)
npm install pg
npm install -D @types/pg

# 4. (Optional) PostgreSQL Background Queue System
npm install pg-boss

# 5. (Optional) Native SMTP Emailer
npm install nodemailer
npm install -D @types/nodemailer
```

### 2. Dependencies That Can Be Removed (Cloudflare-Specific)

If you are running exclusively on a VPS and not dual-deploying to Cloudflare Workers, you can safely remove:

```bash
npm uninstall @prisma/adapter-d1 @cloudflare/workers-types
```

---

## 🖼️ Native Image Optimization with `sharp`

### Why Native Image Optimization Matters
1. **Devotee Privacy & Security (EXIF Stripping)**: Mobile phones automatically attach sensitive metadata (exact GPS coordinates of devotees, camera serial numbers, timestamps) to photos. `sharp` strips all EXIF metadata before saving to disk.
2. **Auto-Orientation**: Mobile photos often have orientation tags. `sharp.rotate()` automatically detects orientation and normalizes image pixels so photos are never displayed upside-down.
3. **Storage & Bandwidth Savings**: Automatic compression to modern `.webp` at 80–85% quality reduces file size by **70–85%** compared to raw JPEG/PNG uploads.
4. **Zero Vendor Lock-In**: Eliminates Cloudinary credit limits and monthly bandwidth costs.

### Code Update: `src/modules/media/media.service.ts`

Replace the manual magic-byte passthrough with native `sharp` image re-encoding:

```typescript
import sharp from 'sharp';
import crypto from 'crypto';
import { prisma } from '../../db/prisma.js';
import { storageService } from '../../integrations/storage/index.js';
import { AppError } from '../../lib/errors.js';
import { APP_CONSTANTS } from '../../config/constants.js';

export class MediaService {
  /**
   * Verifies magic bytes / file signature to prevent arbitrary file upload vulnerabilities
   */
  static isValidImageSignature(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) return true;

    // WebP: RIFF ... WEBP
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    return riff === 'RIFF' && webp === 'WEBP';
  }

  static async uploadTempleImage(
    templeId: string,
    fileBuffer: Buffer,
    userId: string
  ) {
    // 1. Initial size check (reject massive payloads immediately)
    if (fileBuffer.length > APP_CONSTANTS.MEDIA.MAX_IMAGE_SIZE_BYTES) {
      throw AppError.badRequest('Image file size exceeds the 5MB limit');
    }

    // 2. Validate genuine image signature
    if (!this.isValidImageSignature(fileBuffer)) {
      throw AppError.badRequest(
        'Invalid image file type. Only genuine JPEG, PNG, or WebP images are allowed.'
      );
    }

    // 3. Process with Sharp: Auto-rotate, resize to 1920x1080 max, strip EXIF/GPS, encode as WebP
    const optimizedBuffer = await sharp(fileBuffer)
      .rotate() // Auto-orient based on EXIF orientation tag BEFORE stripping
      .resize({
        width: 1920,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();

    const filename = `${crypto.randomUUID()}.webp`;
    const folder = `temples/${templeId}`;

    // 4. Save to storage (LocalStorageService or S3/MinIO)
    const { url, publicId } = await storageService.uploadImage(
      optimizedBuffer,
      folder,
      filename
    );

    // 5. Store record in database
    return await prisma.mediaAsset.create({
      data: {
        templeId,
        publicId,
        url,
        uploadedById: userId,
      },
    });
  }

  static async listTempleMedia(templeId: string) {
    return await prisma.mediaAsset.findMany({
      where: { templeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async deleteTempleMedia(templeId: string, mediaId: string) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaId, templeId },
    });

    if (!asset) {
      throw AppError.notFound('Media asset not found');
    }

    await storageService.deleteImage(asset.publicId);
    await prisma.mediaAsset.delete({ where: { id: mediaId } });

    return { message: 'Image deleted successfully' };
  }
}
```

### Code Update: `src/modules/super/super.service.ts`

Apply thumbnail / hero banner optimization for temple registration:

```typescript
// Inside registerTemple method in src/modules/super/super.service.ts:
const optimizedBuffer = await sharp(fileBuffer)
  .rotate()
  .resize({ width: 1200, height: 800, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80 })
  .toBuffer();

const filename = `${crypto.randomUUID()}.webp`;
const folder = 'temples';

const { url, publicId } = await storageService.uploadImage(
  optimizedBuffer,
  folder,
  filename
);
```

---

## 🔐 Native Password Hashing (`argon2`)

Pure JavaScript `@noble/hashes` is portable across edge isolates but computes on the main thread (~1.4 seconds per hash). On a multi-core Linux VPS, native `argon2` utilizes C++ SIMD instructions on background libuv worker threads (~35ms per hash) without blocking HTTP requests.

### Code Update: `src/lib/hashing.ts`

```typescript
import argon2 from 'argon2';
import crypto from 'crypto';
import { env } from '../config/env.js';

export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

// Retain HMAC and token hashing utilities
export function hashOtp(otp: string): string {
  return crypto.createHmac('sha256', env.OTP_HMAC_SECRET).update(otp).digest('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

---

## 🗄️ Database: Switching from SQLite (D1) to PostgreSQL

### 1. Update `prisma/schema.prisma`

Change the datasource provider to `postgresql` and remove the D1 adapter preview flag:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2. Update `src/db/prisma.ts`

Replace the D1 adapter logic with standard Prisma PostgreSQL connection pooling:

```typescript
import { PrismaClient } from '../generated/prisma/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const prisma = new PrismaClient({
  log:
    env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
});

prisma.$connect()
  .then(() => logger.info('🐘 Connected to PostgreSQL database'))
  .catch((err) => logger.error({ err }, 'Failed to connect to PostgreSQL database'));
```

---

## 🌐 Full Ubuntu 22.04 / 24.04 VPS Setup Walkthrough

### Step 1: System Updates & System Dependencies

Connect to your VPS via SSH and install the base tools and the native image processing library (`libvips-dev`):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw fail2ban libvips-dev nginx certbot python3-certbot-nginx
```

### Step 2: Install Node.js 22 LTS

Install Node.js 22 LTS via the official NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Should display v22.x.x
```

Install PM2 globally for production process management:

```bash
sudo npm install -g pm2
```

### Step 3: Install and Configure PostgreSQL 16+

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create the application database and user:

```bash
sudo -u postgres psql
```

Inside the PostgreSQL prompt:

```sql
CREATE DATABASE temple_db;
CREATE USER temple_user WITH ENCRYPTED PASSWORD 'YOUR_SUPER_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE temple_db TO temple_user;
ALTER DATABASE temple_db OWNER TO temple_user;
\q
```

### Step 4: Create Dedicated Deploy User & Directory

Never run your Node.js application as `root`:

```bash
sudo adduser --disabled-password --gecos "" temple
sudo usermod -aG sudo temple
sudo mkdir -p /var/www/temple-backend
sudo chown -R temple:temple /var/www/temple-backend
```

### Step 5: Deploy Code & Configure `.env`

Switch to the `temple` user and clone your repository:

```bash
sudo -u temple -i
cd /var/www/temple-backend
git clone <YOUR_GIT_REPOSITORY_URL> .
npm install
```

Create the production `.env` file:

```bash
nano .env
```

Paste the production environment variables:

```env
# Application
NODE_ENV=production
PORT=3000
TRUST_PROXY_HOPS=1
RUN_JOBS=true

# Database (PostgreSQL)
DATABASE_URL="postgresql://temple_user:YOUR_SUPER_SECURE_PASSWORD@127.0.0.1:5432/temple_db?schema=public&connection_limit=20"

# JWT & Cryptography (Generate via: openssl rand -hex 32)
JWT_PRIVATE_KEY=""
JWT_PUBLIC_KEY=""
JWT_ISSUER="temple-platform"
JWT_AUDIENCE="temple-platform-clients"
OTP_HMAC_SECRET="super-secret-hmac-key-at-least-32-characters-long"
QR_SIGNING_SECRET="super-secret-qr-key-at-least-32-characters-long"

# Email Delivery (Brevo HTTP REST or Console)
EMAIL_PROVIDER=brevo
BREVO_SMTP_KEY="xkeysib-your-real-brevo-api-key"
EMAIL_FROM="noreply@yourtempledomain.com"

# Storage Options: "local" (uses /var/www/temple-backend/uploads) or Cloudinary
STORAGE_PROVIDER=local
CLOUDINARY_URL=""

# Allowed Mobile & Web Client Origins (comma-separated)
CORS_ORIGINS="https://templeplatform.org,https://admin.templeplatform.org,http://localhost:19006"
```

### Step 6: Generate Prisma Client & Run Migrations

```bash
# Generate the Prisma Client
npm run db:generate

# Deploy migrations to PostgreSQL
npx prisma migrate deploy

# Seed initial admin & demo data
npm run db:seed

# Build the TypeScript project
npm run build
```

---

## ⚙️ Process Management with PM2

Create a PM2 configuration file `ecosystem.config.cjs` in `/var/www/temple-backend/`:

```javascript
module.exports = {
  apps: [
    {
      name: 'temple-api',
      script: 'dist/server.js',
      instances: 'max',       // Utilize all available CPU cores (cluster mode)
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/temple/err.log',
      out_file: '/var/log/temple/out.log',
      merge_logs: true,
      time: true,
      autorestart: true,
    },
  ],
};
```

Set up log directories and start the application:

```bash
sudo mkdir -p /var/log/temple
sudo chown -R temple:temple /var/log/temple

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list and configure auto-start on reboot
pm2 save
pm2 startup systemd
# (Run the sudo env PATH=... command that PM2 outputs)
```

---

## 🔒 Nginx Reverse Proxy, Image Serving & SSL Setup

Nginx acts as the public reverse proxy, terminating SSL, enforcing upload limits, and serving static uploaded media directly from disk with browser caching headers.

### Step 1: Create Nginx Site Configuration

```bash
sudo nano /etc/nginx/sites-available/temple.conf
```

Paste the following configuration (replace `api.yourdomain.com` with your domain):

```nginx
# Rate limiting zone (10 requests per second per IP)
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    listen 80;
    listen [::]:80;
    server_name api.yourdomain.com;

    # Redirect all HTTP requests to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.yourdomain.com;

    # SSL configuration will be managed by Certbot

    # CRITICAL: Allow up to 10MB image uploads (default Nginx limit is 1MB)
    client_max_body_size 10M;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Direct Static Serving for Optimized Uploaded Media
    # Bypasses Node.js completely for zero-overhead, cached image delivery
    location /uploads/ {
        alias /var/www/temple-backend/uploads/;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
        try_files $uri =404;
    }

    # Reverse Proxy to Express API
    location / {
        # Rate limiting burst
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Upgrade headers for WebSockets / HTTP keep-alive
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Standard Proxy Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the configuration and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/temple.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Step 2: Obtain Free SSL Certificate via Let's Encrypt

```bash
sudo certbot --nginx -d api.yourdomain.com
```

Certbot will automatically verify domain ownership and inject the SSL directives into `/etc/nginx/sites-available/temple.conf`.

---

## 🛡️ Firewall & Server Hardening

Configure UFW (Uncomplicated Firewall) to allow only SSH, HTTP, and HTTPS traffic:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Certbot renewal)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

Enable and start Fail2ban to block brute-force attacks:

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 💾 Automated PostgreSQL Database Backups

Create an automated backup script to dump and gzip the database daily:

```bash
sudo mkdir -p /var/backups/postgresql
sudo chown -R postgres:postgres /var/backups/postgresql
sudo nano /usr/local/bin/backup-temple-db.sh
```

Paste the backup script:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/postgresql"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/temple_db_$TIMESTAMP.sql.gz"

# Perform compressed pg_dump
sudo -u postgres pg_dump -d temple_db | gzip > "$FILENAME"

# Delete backups older than 30 days
find "$BACKUP_DIR" -type f -name "temple_db_*.sql.gz" -mtime +30 -delete

echo "Backup created successfully at $FILENAME"
```

Make it executable and add to crontab:

```bash
sudo chmod +x /usr/local/bin/backup-temple-db.sh

# Edit root crontab
sudo crontab -e
```

Add this line to run daily at 02:30 AM:

```cron
30 2 * * * /usr/local/bin/backup-temple-db.sh >> /var/log/temple-backup.log 2>&1
```

---

## 🐳 Alternative: Single-Command Docker Deployment

If you prefer running via Docker and Docker Compose on your VPS:

### `Dockerfile`

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native sharp/argon2 compilation
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run db:generate
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install runtime libvips library
RUN apk add --no-cache vips

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder /app/prisma ./prisma

# Volume for uploaded media
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### `docker-compose.yml`

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://temple_user:securepassword@db:5432/temple_db?schema=public
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - uploads_data:/app/uploads
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: temple_db
      POSTGRES_USER: temple_user
      POSTGRES_PASSWORD: securepassword
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

volumes:
  postgres_data:
  uploads_data:
```

---

## 📋 Quick Migration Checklist

When transitioning between Cloudflare Workers and a VPS deployment:

- [ ] **Install Packages**: `npm install sharp argon2 pg`
- [ ] **Image Optimization**: Replace magic-byte passthrough with `sharp().rotate().resize(...).webp().toBuffer()` in `media.service.ts` and `super.service.ts`.
- [ ] **Argon2 Hashing**: Point `hashPassword` and `verifyPassword` in `src/lib/hashing.ts` to native `argon2`.
- [ ] **Database Provider**: Switch `prisma/schema.prisma` datasource provider from `sqlite` to `postgresql`.
- [ ] **Prisma Client**: Remove `@prisma/adapter-d1` from `src/db/prisma.ts`.
- [ ] **Nginx Upload Limit**: Ensure `client_max_body_size 10M;` is present in your Nginx configuration.
- [ ] **Static Media Route**: Serve `/uploads/` directly from disk with `add_header Cache-Control "public, max-age=31536000, immutable";`.
- [ ] **Process Management**: Start application using PM2 cluster mode or Docker Compose.
- [ ] **Security**: Enable UFW firewall and Certbot HTTPS certificate renewal.
