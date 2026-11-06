# Temple Platform: Backend API

Production-ready backend for the multi-temple discovery, pooja booking, and administration platform. Built with **Node.js 24 LTS, TypeScript (strict mode), Express 5, and PostgreSQL 18 with Prisma ORM**.

---

## 🛕 Overview

The Temple Platform enables devotees to discover temples, check pooja schedules, book offerings with real-time seat availability, and check in via secure QR codes at temple counters. Every participating temple securely manages its own information, schedules, and staff under strict multi-tenant isolation.

### Core Architectural Principles
1. **Multi-tenancy & Isolation**: Shared schema with `temple_id` foreign keys and strict `templeScope` middleware. A temple admin cannot see or mutate another temple's records.
2. **Atomic Slot Reservation**: Concurrency-safe atomic SQL reservation on `slot_inventory` using bound statements—prevents double bookings without table locking.
3. **Defense in Depth**: Zero mass assignment, Argon2id password hashing, Ed25519 asymmetric JWT access tokens, SHA-256 hashed refresh tokens with family reuse theft detection, and HMAC-signed QR check-in payloads.
4. **Resilient Integrations**: Pluggable interfaces for Email (Console / Brevo SMTP), Media Storage (Local / Cloudinary with Sharp metadata stripping), and Push Notifications (Mock / Firebase Cloud Messaging).
5. **Background Processing**: `pg-boss` queue and scheduler running inside PostgreSQL for automated inventory generation, booking reminders, and cleanup.

---

## 🛠️ Technology Stack

| Concern | Tool / Library |
|---|---|
| **Runtime & Language** | Node.js 24 LTS & TypeScript 5 (Strict mode, ES Modules) |
| **Framework** | Express 5 |
| **Database & ORM** | PostgreSQL 18 & Prisma 6/7 Client |
| **Tokens & Passwords** | `jose` (Ed25519 EdDSA), `argon2` (argon2id) |
| **Validation** | `zod` |
| **Logging & Security** | `pino`, `helmet`, `cors`, `express-rate-limit` |
| **Media & Images** | `sharp` (EXIF stripping), Cloudinary integration |
| **Push Notifications**| Firebase Cloud Messaging (`firebase-admin`) |
| **Background Jobs** | `pg-boss` |
| **Documentation** | OpenAPI 3.1 & Swagger UI |
| **Testing** | Vitest & Supertest |

---

## 📁 Repository Structure

```
backend/
├── .github/workflows/ci.yml       # GitHub Actions CI pipeline
├── prisma/
│   ├── schema.prisma              # Complete multi-tenant Prisma schema
│   ├── migrations/                # Handcrafted DDL & SQL constraints
│   ├── seed.ts                    # Demo temple and Super Admin seed
│   └── init-roles.sql             # Least-privilege application role script
├── src/
│   ├── config/                    # Zod-validated environment config & constants
│   ├── db/                        # Prisma client & logging
│   ├── docs/                      # OpenAPI 3.1 specification & Swagger UI
│   ├── integrations/              # Email, Storage, and Push provider adapters
│   ├── lib/                       # Errors, JWT/Ed25519 tokens, Argon2, QR, CSV
│   ├── middleware/                # RequestId, Auth, TempleScope, RateLimit, Validate, Error
│   ├── modules/
│   │   ├── audit/                 # Administrative audit log recorder
│   │   ├── auth/                  # Email OTP, Super Admin Argon2, Refresh token rotation
│   │   ├── users/                 # Devotee profile, saved family members, FCM tokens
│   │   ├── temples/               # Public search, geo filtering, temple management
│   │   ├── staff/                 # Temple staff assignment and session revoking
│   │   ├── poojas/                # Offerings CRUD and seat availability engine
│   │   ├── slots/                 # Weekly schedules, slot inventory, date blocking
│   │   ├── occasions/             # Festivals and special event calendar
│   │   ├── bookings/              # Atomic booking engine, state machine, QR check-in, CSV
│   │   ├── notifications/         # Announcements & FCM push dispatch
│   │   ├── media/                 # Image validation, Sharp EXIF stripping, Cloudinary
│   │   ├── reports/               # Temple revenue summary & platform dashboard
│   │   └── super/                 # Platform Super Admin provisioning endpoints
│   ├── jobs/                      # pg-boss background workers & cron schedules
│   ├── app.ts                     # Express app assembly & middleware order
│   └── server.ts                  # Server bootstrap & graceful shutdown
├── test/                          # Unit and integration test suites
├── Dockerfile                     # Multi-stage production container
└── docker-compose.yml             # Local PostgreSQL 18 & API services
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 24 LTS or higher
- PostgreSQL 18 (or Docker)

### 2. Setup Environment
```bash
cp .env.example .env
npm install
```

### 3. Generate Prisma Client
```bash
npm run db:generate
```

### 4. Run Locally
```bash
# Start development server with hot-reload
npm run dev

# Run TypeScript typechecker
npm run typecheck

# Run test suite
npm run test

# Production build
npm run build
```

---

## 📖 API Documentation & Endpoints

When the server runs, interactive Swagger UI is available at:
👉 **`http://localhost:3000/docs`**
👉 Raw OpenAPI 3.1 Spec: **`http://localhost:3000/api/v1/openapi.json`**

### Key Endpoints Overview

#### 1. Authentication (`/api/v1/auth`)
- `POST /auth/otp/request` - Send 6-digit email OTP (Rate limited: 3 per email / 10 mins).
- `POST /auth/otp/verify` - Verify OTP; creates devotee user if new; returns Ed25519 access token + refresh token.
- `POST /auth/login` - Platform Super Admin password login (Argon2id with 5-attempt lockout).
- `POST /auth/refresh` - Refresh token rotation with theft reuse detection.
- `POST /auth/logout` - Revokes refresh session.

#### 2. Devotee Profile & Family (`/api/v1`)
- `GET /me` & `PATCH /me` - Devotee profile.
- `DELETE /me` - Anonymizes devotee account for Google Play Store compliance.
- `GET, POST, PATCH, DELETE /me/family-members` - Saved family members for quick pooja booking.
- `POST, DELETE /me/devices` - Register and unregister FCM push tokens.

#### 3. Public Discovery (`/api/v1`)
- `GET /temples` - List active temples (`q`, `district`, `deity`, `lat`, `lng`, `radiusKm`).
- `GET /temples/:idOrSlug` - Temple profile, active poojas, and upcoming occasions.
- `GET /temples/:id/poojas` - Poojas with weekly schedules.
- `GET /poojas/:id/availability` - Query concrete date slots and remaining seats (`capacity - booked`).
- `GET /occasions` - Platform festival and occasion calendar.
- `GET /search` - Cross-entity search (temples, poojas, occasions).

#### 4. Booking Engine (`/api/v1/bookings`)
- `POST /bookings` - Book a pooja (`Idempotency-Key` header supported). Atomic slot reservation.
- `GET /bookings` - Devotee's own bookings list with cursor pagination.
- `GET /bookings/:id` - Booking details with signed QR payload.
- `POST /bookings/:id/cancel` - Cancel booking (enforces temple cancellation cutoff).
- `POST /bookings/:id/reschedule` - Atomic reschedule to another slot (max 3 reschedules).

#### 5. Temple Administration (`/api/v1/admin/temples/:templeId`)
*Protected by `authenticate()` and `templeScope(role)` middleware.*
- `GET, PATCH /` - Update temple information and cutoff rules.
- `GET, POST, PATCH, DELETE /poojas` - Manage temple poojas.
- `GET, POST /poojas/:id/schedules` - Recurring weekly schedules.
- `POST /schedules/:id/block-date` - Block a specific date or override capacity.
- `GET, POST, PATCH, DELETE /occasions` - Occasions & festivals.
- `GET, POST, DELETE /staff` - Assign or remove staff. Removing staff revokes sessions immediately.
- `GET /bookings` - Filter bookings by date, pooja, code, or devotee phone.
- `POST /bookings/check-in` - Counter QR scan verification.
- `PATCH /bookings/:id/status` - Staff status transitions (`COMPLETED`, `CANCELLED`, `NO_SHOW`).
- `GET /bookings/export/csv` - Export bookings as safe CSV (formula injection prevented).
- `GET /reports/summary` - Revenue and devotee statistics dashboard.
- `POST /media/images` - Upload temple image (strips EXIF metadata with Sharp, stores in Cloudinary).

#### 6. Platform Super Admin (`/api/v1/super`)
*Protected by `SUPER_ADMIN` global role.*
- `POST /super/temples` - Provision new temple in `DRAFT` status.
- `PATCH /super/temples/:id/status` - Activate or suspend temple.
- `POST /super/temples/:id/admins` - Appoint temple manager.
- `GET /super/temples` - Platform-wide temple list with statistics.
- `GET /super/users` & `PATCH /super/users/:id/status` - Manage and suspend users.
- `GET /super/reports/platform` - Global metrics (temples, devotees, revenue, bookings).

---

## 🔒 Security Architecture

- **Deny-by-default Authorization**: All routes explicitly declare required roles.
- **Tenant Isolation**: Services enforce `where: { templeId }` from verified request context; foreign temple queries return `404 Not Found` rather than `403 Forbidden` to prevent enumeration.
- **Strict Input Validation**: Zod schemas reject unknown fields to prevent mass assignment.
- **Timing Safe Verification**: Constant-time byte comparisons prevent timing attacks on OTP codes and QR HMAC signatures.
- **CSV Sanitization**: Prepends `'` to any cell starting with `=`, `+`, `-`, or `@`.
- **Image Security**: Verifies file signatures (magic bytes) to prevent executable upload; Sharp strips camera/GPS EXIF data before storage.
