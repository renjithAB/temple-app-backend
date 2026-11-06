# Temple Platform: Backend and Database Design

Version 1 design for the Node.js (Express 5) backend and the PostgreSQL database of the multi-temple platform. Version 1 runs on free services only, has no online payments, and follows standard security practice. The mobile app and the admin web panel are clients of this API.

## 1. Goals and design principles

1. **Every temple owns its data.** Each temple-owned row carries a `temple_id`, and the API enforces that nobody touches another temple's rows.
2. **The database protects correctness.** Constraints, unique indexes, and transactions prevent double bookings and orphaned data. The application code is not the only line of defence.
3. **Clients are never trusted.** The server decides availability, price, and permissions. The app only displays and requests.
4. **Boring and reliable.** A modular monolith, one database, standard tools, and as few moving parts as possible, because free hosting tiers are small.
5. **Free to run.** Every external service has a free tier and sits behind a small interface (email, storage, push), so changing a provider later touches one file.
6. **Secure by default.** Deny by default, validate every input, give each role the least access it needs, and log what matters (Section 12).
7. **Payments ready, not built.** Prices are shown, and the offering is paid at the temple counter in version 1. Nothing in the design blocks online payment later (Section 10).

## 2. Technology choices

| Concern | Choice | Reason |
| --- | --- | --- |
| Runtime and language | Node.js 26 (LTS from October 2026; use 24 LTS if your host lacks 26), TypeScript in strict mode | Type safety, and types shared with the clients |
| Framework | Express 5 | Rejected promises in async handlers are caught natively, mature ecosystem. Express is unopinionated, so Section 3 fixes the structure |
| Database | PostgreSQL 18 | Latest stable release at the time of writing. PostgreSQL 19 was in beta in mid 2026, so upgrade once it is generally available and your host offers it |
| ORM and migrations | Prisma 7 with the `prisma-client` generator, `@prisma/adapter-pg`, and `prisma.config.ts` | Typed queries and migrations. Raw SQL only for the slot reservation. Prisma 8 was a release candidate, so stay on 7 until 8 is stable |
| Validation | Zod 4 | One schema gives runtime validation and the TypeScript type |
| Tokens and hashing | `jose` (JWT), `argon2` (passwords) | Maintained, standards based libraries |
| Email (OTP) | Nodemailer with Brevo free SMTP | Free daily quota (Section 10) |
| Background jobs | pg-boss | Queue and scheduler stored in PostgreSQL, so there is no Redis to host |
| Rate limiting | express-rate-limit | Per IP and per account limits |
| Security headers | Helmet | Standard secure response headers |
| File storage | Cloudinary free plan | Images only, resized for mobile |
| Push notifications | Firebase Cloud Messaging with `firebase-admin` | Free, the standard on Android |
| API docs | OpenAPI 3.1 generated from the Zod schemas, served with Swagger UI | Lets the app developer start early |
| Logging and errors | pino, pino-http, Sentry free plan | Structured logs and alerts |
| Testing | Vitest, Supertest, Testcontainers | Tests run against a real PostgreSQL |
| Code quality | ESLint, Prettier, Husky, Conventional Commits | Consistent code and history |

Install the latest stable version of every package when the project starts, commit the lockfile, and let Dependabot propose upgrades. Run `npm outdated` and `npm audit` before each release. Redis is left out on purpose: OTP codes and jobs live in PostgreSQL, and in-memory rate limiting is enough for a single server instance.

## 3. Architecture

The system is one Express application. Background jobs run inside the same process in version 1. They can move to a separate worker later by starting the API with `RUN_JOBS=false` and a second copy with `RUN_JOBS=true`.

- **API:** serves REST requests under `/api/v1`.
- **Jobs:** pg-boss runs reminders and clean-up tasks on a schedule.
- **PostgreSQL:** the single source of truth. It also holds OTP codes and the job queue.
- **Cloudinary:** stores images. The database keeps URLs and public IDs only.
- **Firebase Cloud Messaging:** delivers push notifications.
- **Brevo SMTP:** delivers OTP emails.

### Layering and conventions

- **Request flow:** route, then middleware (authenticate, authorize, templeScope, validate), then controller, then service, then Prisma. Controllers only translate HTTP. Services hold business rules and transactions. Nothing outside a service touches Prisma.
- **Module layout:** each module has `*.routes.ts`, `*.controller.ts`, `*.service.ts`, and `*.schema.ts` (Zod).
- **Language:** ES modules (`"type": "module"`), TypeScript strict mode, no `any`.
- **Errors:** one `AppError(code, httpStatus, message)` type. A central error middleware turns errors into the format in Section 9.1 and hides internals in production.
- **Async handlers:** Express 5 forwards rejected promises to the error middleware, so no wrapper function is needed.
- **Request ID:** every request gets an ID that appears in every log line and in the error response.
- **Configuration:** twelve-factor style. Environment variables only, validated with Zod at startup.
- **Middleware order** (fixed in `app.ts`): request ID, logger, Helmet, CORS, rate limit, body parser with a size limit, routes, not-found handler, error handler.
- **Shutdown:** on SIGTERM stop accepting requests, finish in-flight work, then close pg-boss and Prisma.
- **Health:** `GET /health` (process is alive) and `GET /ready` (database is reachable).

### Folder structure

```
src/
  server.ts          start the HTTP server, graceful shutdown
  app.ts             build the Express app, middleware order lives here
  config/            env.ts (Zod validated), constants
  db/                Prisma client, transaction helper
  middleware/        requestId, authenticate, authorize, templeScope,
                     validate, rateLimit, notFound, errorHandler
  lib/               errors, logger, tokens, hashing, pagination, codes
  integrations/      email/, storage/, push/  (interface + provider each)
  modules/
    auth/            routes, controller, service, schema
    users/           profile, family members, device tokens
    temples/         temple CRUD, public listing and search
    staff/           temple admins and staff assignment
    poojas/          pooja CRUD and schedules
    occasions/       festivals and special events
    slots/           slot inventory and availability
    bookings/        booking engine, cancel, reschedule, check-in
    notifications/   push and announcements
    media/           image upload
    reports/         admin dashboards
    audit/           audit log
  jobs/              pg-boss workers and schedules
  generated/         Prisma client output (git-ignored)
prisma/
  schema.prisma
  migrations/
  seed.ts
prisma.config.ts
test/                unit, integration, security
.github/workflows/   CI
```

## 4. Multi-tenancy model

One database, one schema, and a `temple_id` column on every temple-owned table. This is called shared-schema multi-tenancy. It is the right choice for tens to hundreds of temples. A database per temple would make migrations and reporting painful for no gain.

**How it is enforced**

- Temple admins and staff are linked to a temple through the `temple_staff` table. The access token carries only the user ID and global role. Temple roles are read from the database on each request (a cheap indexed lookup), so removing a staff member takes effect immediately.
- A `templeScope` middleware runs on every `/admin/temples/:templeId/...` route. It checks that the caller is `SUPER_ADMIN`, or has an active `temple_staff` row for that `templeId` with a sufficient role. It then stores the verified `templeId` on the request.
- Every service query for temple data includes `where: { templeId }`. Services take `templeId` from the verified request, never from the request body.
- Child rows are checked through their parent. To edit a pooja, the service loads it with the `templeId` from the URL. If it is not found, the response is 404, not 403, so rows in other temples are not even confirmed to exist.
- Later, as defence in depth, PostgreSQL row-level security can be added by setting the current temple per transaction, so even a forgotten `where` returns nothing.
- Tests: an end to end suite logs in as Temple A's admin and tries to read, edit, and delete every kind of Temple B record. All must fail.

## 5. Roles and permissions

| Role | Scope | Can do |
| --- | --- | --- |
| GUEST | No login | Read public temple, pooja, occasion data. Search |
| DEVOTEE | Own account | Guest actions, plus book, cancel, view own bookings, manage profile and family members |
| TEMPLE\_STAFF | One or more temples | View that temple's bookings, check devotees in, mark completed |
| TEMPLE\_ADMIN | One or more temples | Staff actions, plus edit temple, poojas, schedules, occasions, announcements, staff, reports |
| SUPER\_ADMIN | Whole platform | Create temples, assign temple admins, suspend temples or users, platform reports |

`GUEST` is not stored anywhere. It simply means a request without a valid token, which is allowed only on public endpoints.

A user has one global `role` (`DEVOTEE` or `SUPER_ADMIN`). Temple roles live only in `temple_staff`, so a person can be a devotee and also staff at a temple, and can even manage two temples.

## 6. Database design

### 6.1 Conventions

- **Primary keys** are UUID v7 (`@default(uuid(7))`). They are time ordered, so indexes stay compact.
- **Naming:** tables are plural snake\_case and columns are snake\_case in PostgreSQL. Prisma models are PascalCase and camelCase fields, mapped with `@@map` and `@map`.
- **Money** is stored as integer paise (`price_paise`), never floats. In version 1 prices are shown to devotees and paid at the temple.
- **Timestamps** are `timestamptz` (`@db.Timestamptz(3)`), stored in UTC. Temple dates and times (`slot_date`, `start_time`) are a plain `date` and an `HH:MM` text in the temple's local time (India Standard Time), because "6:00 AM at this temple" is not a UTC moment.
- **Every table** has `created_at` and `updated_at`.
- **Soft delete** (`deleted_at`) on temples, poojas, and occasions, so old bookings still point to valid rows. Bookings are never deleted.
- **Enums** for statuses.
- **Emails** are stored lowercase, enforced by a check constraint.
- **Foreign keys** are always declared, with an explicit `onDelete`. Restrict is the default. Cascade is used only for pure child data such as devotee lines on a booking.
- **Indexes** exist on every foreign key and on every filter used in Section 9.
- **Migrations:** `prisma migrate dev` locally and `prisma migrate deploy` in the release step. An applied migration is never edited, and `db push` is never used on a shared database.

### 6.2 Entity overview

```
users ──< family_members
users ──< refresh_sessions
users ──< device_tokens
users ──< temple_staff >── temples
otp_codes                       (keyed by email, no foreign key)
temples ──< poojas ──< pooja_schedules ──< slot_inventory
temples ──< occasions ──< occasion_poojas >── poojas
temples ──< announcements
temples ──< media_assets
users ──< bookings >── temples / poojas / pooja_schedules / occasions
bookings ──< booking_devotees
bookings ──< booking_status_history
audit_logs                      (all admin changes)
```

### 6.3 Prisma schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql" // the connection URL lives in prisma.config.ts
}

enum GlobalRole {
  DEVOTEE
  SUPER_ADMIN
}

enum TempleRole {
  STAFF
  ADMIN
}

enum TempleStatus {
  DRAFT
  ACTIVE
  SUSPENDED
}

enum BookingStatus {
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum Weekday {
  MON
  TUE
  WED
  THU
  FRI
  SAT
  SUN
}

model User {
  id            String     @id @default(uuid(7)) @db.Uuid
  email         String     @unique                      // stored lowercase
  phone         String?    @unique                      // optional in v1, used for SMS later
  name          String?
  role          GlobalRole @default(DEVOTEE)
  passwordHash  String?    @map("password_hash")        // argon2id, super admin only
  language      String     @default("en")               // en, ml
  isActive      Boolean    @default(true) @map("is_active")
  failedLogins  Int        @default(0) @map("failed_logins")
  lockedUntil   DateTime?  @map("locked_until") @db.Timestamptz(3)
  lastLoginAt   DateTime?  @map("last_login_at") @db.Timestamptz(3)
  createdAt     DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime   @updatedAt @map("updated_at") @db.Timestamptz(3)
  familyMembers FamilyMember[]
  sessions      RefreshSession[]
  devices       DeviceToken[]
  staffRoles    TempleStaff[]
  bookings      Booking[]

  @@map("users")
}

model OtpCode {
  id         String    @id @default(uuid(7)) @db.Uuid
  email      String
  codeHash   String    @map("code_hash")               // HMAC of the code, never the code
  attempts   Int       @default(0)
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(3)
  consumedAt DateTime? @map("consumed_at") @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([email, createdAt])
  @@index([expiresAt])
  @@map("otp_codes")
}

model FamilyMember {                                    // saved devotee details for quick booking
  id        String  @id @default(uuid(7)) @db.Uuid
  userId    String  @map("user_id") @db.Uuid
  name      String
  nakshatra String?
  gotra     String?
  relation  String?
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("family_members")
}

model RefreshSession {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  familyId  String    @map("family_id") @db.Uuid      // all rotations of one login share a family
  tokenHash String    @unique @map("token_hash")     // SHA-256 of the token, never the token
  userAgent String?   @map("user_agent")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(3) // set on rotation, reuse means theft
  revokedAt DateTime? @map("revoked_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@map("refresh_sessions")
}

model DeviceToken {
  id        String   @id @default(uuid(7)) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  fcmToken  String   @unique @map("fcm_token")
  platform  String                                    // android, ios
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("device_tokens")
}

model Temple {
  id                      String       @id @default(uuid(7)) @db.Uuid
  slug                    String       @unique
  name                    String
  nameMl                  String?      @map("name_ml")
  deity                   String
  description             String?
  descriptionMl           String?      @map("description_ml")
  addressLine             String       @map("address_line")
  district                String
  state                   String       @default("Kerala")
  pincode                 String?
  latitude                Decimal?     @db.Decimal(9, 6)
  longitude               Decimal?     @db.Decimal(9, 6)
  phone                   String?
  email                   String?
  coverImageUrl           String?      @map("cover_image_url")
  openingHours            Json?        @map("opening_hours") // general darshan timings
  bookingAdvanceDays      Int          @default(60) @map("booking_advance_days")
  cancellationCutoffHours Int          @default(24) @map("cancellation_cutoff_hours")
  status                  TempleStatus @default(DRAFT)
  deletedAt               DateTime?    @map("deleted_at") @db.Timestamptz(3)
  createdAt               DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt               DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  staff                   TempleStaff[]
  poojas                  Pooja[]
  occasions               Occasion[]
  announcements           Announcement[]
  media                   MediaAsset[]
  bookings                Booking[]

  @@index([district])
  @@index([status, deletedAt])
  @@map("temples")
}

model TempleStaff {
  id        String     @id @default(uuid(7)) @db.Uuid
  userId    String     @map("user_id") @db.Uuid
  templeId  String     @map("temple_id") @db.Uuid
  role      TempleRole
  isActive  Boolean    @default(true) @map("is_active")
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  user      User       @relation(fields: [userId], references: [id])
  temple    Temple     @relation(fields: [templeId], references: [id])

  @@unique([userId, templeId])
  @@index([templeId])
  @@map("temple_staff")
}

model MediaAsset {
  id           String   @id @default(uuid(7)) @db.Uuid
  templeId     String   @map("temple_id") @db.Uuid
  publicId     String   @unique @map("public_id")    // Cloudinary public ID, needed to delete
  url          String
  uploadedById String   @map("uploaded_by_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  temple       Temple   @relation(fields: [templeId], references: [id])

  @@index([templeId])
  @@map("media_assets")
}

model Pooja {
  id                    String    @id @default(uuid(7)) @db.Uuid
  templeId              String    @map("temple_id") @db.Uuid
  name                  String
  nameMl                String?   @map("name_ml")
  description           String?
  pricePaise            Int       @default(0) @map("price_paise") // shown, paid at the temple
  durationMinutes       Int?      @map("duration_minutes")
  maxDevoteesPerBooking Int       @default(5) @map("max_devotees_per_booking")
  requiresBooking       Boolean   @default(true) @map("requires_booking") // false = informational
  isActive              Boolean   @default(true) @map("is_active")
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  temple                Temple    @relation(fields: [templeId], references: [id])
  schedules             PoojaSchedule[]
  occasionPoojas        OccasionPooja[]
  bookings              Booking[]

  @@index([templeId, isActive])
  @@map("poojas")
}

model PoojaSchedule {                                   // recurring weekly timing
  id        String   @id @default(uuid(7)) @db.Uuid
  poojaId   String   @map("pooja_id") @db.Uuid
  templeId  String   @map("temple_id") @db.Uuid         // denormalised for fast tenant filtering
  weekday   Weekday
  startTime String   @map("start_time")                 // "06:30", temple local time
  endTime   String?  @map("end_time")
  capacity  Int                                         // max devotees per day for this slot
  isActive  Boolean  @default(true) @map("is_active")
  pooja     Pooja    @relation(fields: [poojaId], references: [id])
  inventory SlotInventory[]
  bookings  Booking[]

  @@unique([poojaId, weekday, startTime])
  @@index([templeId])
  @@map("pooja_schedules")
}

model SlotInventory {                                   // one row per schedule per calendar date
  id         String   @id @default(uuid(7)) @db.Uuid
  scheduleId String   @map("schedule_id") @db.Uuid
  templeId   String   @map("temple_id") @db.Uuid
  slotDate   DateTime @map("slot_date") @db.Date
  capacity   Int                                        // copied from the schedule, can be overridden
  booked     Int      @default(0)
  isBlocked  Boolean  @default(false) @map("is_blocked") // admin can close a date
  schedule   PoojaSchedule @relation(fields: [scheduleId], references: [id])

  @@unique([scheduleId, slotDate])
  @@index([templeId, slotDate])
  @@map("slot_inventory")
}

model Occasion {
  id                String    @id @default(uuid(7)) @db.Uuid
  templeId          String    @map("temple_id") @db.Uuid
  name              String
  nameMl            String?   @map("name_ml")
  description       String?
  startDate         DateTime  @map("start_date") @db.Date
  endDate           DateTime  @map("end_date") @db.Date
  startTime         String?   @map("start_time")
  isRecurringYearly Boolean   @default(false) @map("is_recurring_yearly")
  imageUrl          String?   @map("image_url")
  isPublished       Boolean   @default(false) @map("is_published")
  deletedAt         DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  temple            Temple    @relation(fields: [templeId], references: [id])
  poojas            OccasionPooja[]
  bookings          Booking[]

  @@index([templeId, startDate])
  @@map("occasions")
}

model OccasionPooja {                                   // special poojas held during an occasion
  occasionId String   @map("occasion_id") @db.Uuid
  poojaId    String   @map("pooja_id") @db.Uuid
  occasion   Occasion @relation(fields: [occasionId], references: [id], onDelete: Cascade)
  pooja      Pooja    @relation(fields: [poojaId], references: [id])

  @@id([occasionId, poojaId])
  @@map("occasion_poojas")
}

model Booking {
  id             String        @id @default(uuid(7)) @db.Uuid
  code           String        @unique                 // short human code, e.g. TMP-8K3Q9X
  userId         String        @map("user_id") @db.Uuid
  templeId       String        @map("temple_id") @db.Uuid
  poojaId        String        @map("pooja_id") @db.Uuid
  scheduleId     String        @map("schedule_id") @db.Uuid
  occasionId     String?       @map("occasion_id") @db.Uuid
  bookingDate    DateTime      @map("booking_date") @db.Date
  startTime      String        @map("start_time")       // snapshot of the slot time
  devoteeCount   Int           @map("devotee_count")
  unitPricePaise Int           @map("unit_price_paise") // snapshot, payable at the temple
  totalPaise     Int           @map("total_paise")
  status         BookingStatus @default(CONFIRMED)
  idempotencyKey String?       @map("idempotency_key")
  note           String?
  checkedInAt    DateTime?     @map("checked_in_at") @db.Timestamptz(3)
  checkedInById  String?       @map("checked_in_by_id") @db.Uuid
  cancelledAt    DateTime?     @map("cancelled_at") @db.Timestamptz(3)
  cancelReason   String?       @map("cancel_reason")
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)
  user           User          @relation(fields: [userId], references: [id])
  temple         Temple        @relation(fields: [templeId], references: [id])
  pooja          Pooja         @relation(fields: [poojaId], references: [id])
  schedule       PoojaSchedule @relation(fields: [scheduleId], references: [id])
  occasion       Occasion?     @relation(fields: [occasionId], references: [id])
  devotees       BookingDevotee[]
  history        BookingStatusHistory[]

  @@unique([userId, idempotencyKey])
  @@index([templeId, bookingDate, status])
  @@index([userId, createdAt])
  @@map("bookings")
}

model BookingDevotee {
  id        String  @id @default(uuid(7)) @db.Uuid
  bookingId String  @map("booking_id") @db.Uuid
  name      String
  nakshatra String?
  gotra     String?
  booking   Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)

  @@index([bookingId])
  @@map("booking_devotees")
}

model BookingStatusHistory {
  id          String         @id @default(uuid(7)) @db.Uuid
  bookingId   String         @map("booking_id") @db.Uuid
  fromStatus  BookingStatus? @map("from_status")
  toStatus    BookingStatus  @map("to_status")
  changedById String?        @map("changed_by_id") @db.Uuid
  reason      String?
  createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  booking     Booking        @relation(fields: [bookingId], references: [id])

  @@index([bookingId])
  @@map("booking_status_history")
}

model Announcement {
  id          String    @id @default(uuid(7)) @db.Uuid
  templeId    String    @map("temple_id") @db.Uuid
  title       String
  body        String
  publishAt   DateTime  @default(now()) @map("publish_at") @db.Timestamptz(3)
  sendPush    Boolean   @default(false) @map("send_push")
  createdById String    @map("created_by_id") @db.Uuid
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(3)
  temple      Temple    @relation(fields: [templeId], references: [id])

  @@index([templeId, publishAt])
  @@map("announcements")
}

model AuditLog {
  id         String   @id @default(uuid(7)) @db.Uuid
  actorId    String?  @map("actor_id") @db.Uuid
  templeId   String?  @map("temple_id") @db.Uuid
  action     String                                    // e.g. pooja.update
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id")
  before     Json?
  after      Json?
  ip         String?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([templeId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

The payment tables of the earlier design are gone. Section 10 explains how to add them later without changing the booking tables.

### 6.4 Database rules added by raw SQL migration

Prisma cannot express these, so they go into a hand-written migration:

- `CHECK (capacity >= 0 AND booked >= 0 AND booked <= capacity)` on `slot_inventory`. Even a buggy query can never oversell a slot.
- `CHECK (devotee_count > 0 AND total_paise >= 0)` on `bookings`.
- `CHECK (end_date >= start_date)` on `occasions`.
- `CHECK (email = lower(email))` on `users`.
- `CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')` on `pooja_schedules`, `occasions`, and `bookings`.
- A **partial unique index** so a user cannot hold two active bookings for the same schedule and date: `UNIQUE (user_id, schedule_id, booking_date) WHERE status = 'CONFIRMED'`. Optional. Decide this with the pilot temple.
- Trigram index (`pg_trgm`) on `temples.name`, `name_ml`, and `deity` for search.
- Index on `(latitude, longitude)` for nearby search at this scale. If it grows, move to PostGIS.
- **Two database roles:** a migration role that owns the tables, and an application role with only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on them. The running API cannot alter or drop tables, so a SQL injection or a stolen app credential does far less damage. Connections use TLS (`sslmode=require`).

## 7. The booking engine

This is the most important and riskiest part of the backend.

### 7.1 Availability

Schedules are weekly patterns. Concrete availability exists for a date only when a `slot_inventory` row exists.

- A nightly job creates inventory rows for the next `bookingAdvanceDays` days for every active schedule, so availability is a plain read.
- As a safety net, the booking transaction also upserts the inventory row if it is missing.
- An admin can block a date (set `isBlocked`) or override a date's capacity. Blocking a date with existing bookings returns a warning listing the affected bookings. The admin must confirm, and the devotees are notified.

### 7.2 Creating a booking (one transaction)

1. Validate the request: pooja active, `requiresBooking` true, date inside `bookingAdvanceDays`, not in the past, `devoteeCount` between 1 and `maxDevoteesPerBooking`, devotee list length equals `devoteeCount`.
2. Check the idempotency key. If the same user has already used that key, return the original booking. This protects against double taps and flaky mobile networks.
3. Open a transaction. Run the atomic reservation:

```sql
UPDATE slot_inventory
SET booked = booked + :count
WHERE schedule_id = :scheduleId
  AND slot_date = :date
  AND is_blocked = false
  AND booked + :count <= capacity;
```

If zero rows are updated, the slot is full or blocked, and the response is `409 SLOT_FULL`. This single statement is atomic in PostgreSQL, so two devotees cannot both take the last place, and no explicit lock is needed. The statement runs through Prisma's tagged template (`$executeRaw`) with bound parameters, never string concatenation.

Then, in the same transaction, insert the booking with the price copied from the pooja at that moment, insert the devotee rows, and write the first status history row. The booking is `CONFIRMED` immediately, because nothing is paid online. After the commit (never inside the transaction), queue the confirmation push notification. If a temple later wants to approve bookings by hand, add a `PENDING_APPROVAL` status in front of `CONFIRMED`.

### 7.3 Status flow

```
CONFIRMED ──check-in, or the day has passed──> COMPLETED
    │
    ├──cancelled (before the cutoff, or by staff)──> CANCELLED
    │
    └──devotee did not attend──────────────────────> NO_SHOW
```

Every transition goes through one `BookingStateService` that validates the allowed moves, writes the history row, and releases or keeps capacity. Nobody updates `status` directly anywhere else.

### 7.4 Releasing capacity

When a booking becomes `CANCELLED`, run `UPDATE slot_inventory SET booked = booked - :count` for its slot and date in the same transaction. `COMPLETED` and `NO_SHOW` keep their count, because the place was used or lost. The nightly job that closes past bookings only touches rows still in `CONFIRMED`, so running it twice does no harm.

### 7.5 Cancellation and reschedule

- A devotee can cancel while the time left to the slot is more than the temple's `cancellationCutoffHours`. Temple staff can cancel at any time with a reason, and the devotee is notified.
- Nothing is paid online in version 1, so there are no refunds to handle.
- Reschedule is one transaction: reserve the new slot, release the old one, update the booking. If the new slot is full, nothing changes. A booking can be rescheduled at most 3 times.
- To stop abuse, one user can hold at most 10 active bookings and can create at most 20 bookings a day.

### 7.6 Check-in

Each booking has a signed QR payload containing the booking ID and a signature (HMAC). Staff scan it. The server verifies the signature, checks the booking belongs to the staff member's temple and today's date, and marks `checkedInAt`. A second scan returns "already checked in".

## 8. Authentication and sessions

**OTP login (email)**

1. `POST /auth/otp/request` with an email address. The server trims and lowercases it, generates a 6-digit code with `crypto.randomInt`, stores only a keyed HMAC-SHA256 hash of the code in `otp_codes` with a 5-minute expiry, cancels any earlier unused code for that email, and sends the code by email.
2. `POST /auth/otp/verify` with the email and the code. The server compares hashes with `crypto.timingSafeEqual`, counts the attempt, and marks the code used on success so it works only once. If the user is new, the account is created. Tokens are then issued.

**Protections:** at most 3 code requests per email and 10 per IP in 10 minutes, 5 verification attempts per code, and the same response whether or not the email already has an account. The code is never logged. In development a console email provider prints it, and that provider refuses to start when `NODE_ENV=production`.

**Tokens**

- **Access token:** a JWT valid for 15 minutes, signed with Ed25519 (EdDSA) through `jose`. Claims: `sub` (user ID), `role`, `iss`, `aud`, `exp`, and `jti`. Verification pins the algorithm, issuer, and audience.
- **Refresh token:** a random 256-bit value (`crypto.randomBytes(32)`), valid for 30 days, stored only as a SHA-256 hash in `refresh_sessions`. It is rotated on every use. If a token that was already used shows up again, the whole family is revoked and the user must log in again.
- **Client storage:** the Android app keeps the refresh token in secure storage (Expo SecureStore, backed by the Android Keystore). The web panel keeps it in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie and keeps the access token in memory only, never in localStorage. Cookie based calls also require a custom header (`X-Requested-With`) as a CSRF check.
- **Logout** revokes the session. Suspending a user or removing a staff member revokes all their sessions.

**Admin web login:** temple staff use email OTP like everyone else. The super admin uses email and password (argon2id) followed by an email OTP as a second step. Five failed password attempts lock the account for 15 minutes. An authenticator app (TOTP) can replace the email step later. Super admin accounts are created by a seed script only, never through the API.

**Guests:** no token. Public endpoints use no auth guard and have stricter rate limits.

## 9. API design

Base path `/api/v1`. JSON only. Plural nouns. Cursor pagination on lists (`?limit=20&cursor=...`). Dates are ISO strings.

### 9.1 Response and error format

Success:

```json
{ "data": { }, "meta": { "nextCursor": "abc" } }
```

Error:

```json
{ "error": { "code": "SLOT_FULL", "message": "This slot is full", "details": {} } }
```

The app switches on `code`, never on the message text. Standard codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `SLOT_FULL`, `SLOT_BLOCKED`, `BOOKING_NOT_CANCELLABLE`, `INVALID_OTP`, `RATE_LIMITED`.

### 9.2 Endpoints

**Auth and profile**

| Method | Path | Access |
| --- | --- | --- |
| POST | /auth/otp/request | Public |
| POST | /auth/otp/verify | Public |
| POST | /auth/login | Public (super admin: email and password, then OTP) |
| POST | /auth/refresh | Public (refresh token) |
| POST | /auth/logout | Logged in |
| GET, PATCH | /me | Logged in |
| DELETE | /me | Logged in. Deletes the account, as the Play Store requires |
| GET, POST, PATCH, DELETE | /me/family-members | Devotee |
| POST, DELETE | /me/devices | Logged in (FCM token) |

**Public browsing (guest, devotee)**

| Method | Path | Notes |
| --- | --- | --- |
| GET | /temples | Filters: `q`, `district`, `deity`, `lat`, `lng`, `radiusKm`. Only `ACTIVE` temples |
| GET | /temples/:idOrSlug | Full detail |
| GET | /temples/:id/poojas | With weekly timings |
| GET | /temples/:id/occasions | Filters: `from`, `to` |
| GET | /temples/:id/announcements | Latest first |
| GET | /poojas/:id/availability | Query `from`, `to`. Returns date and slot with seats left |
| GET | /occasions | Platform wide upcoming list. Calendar view |
| GET | /search | Search across temples, poojas, occasions |

**Bookings (devotee)**

| Method | Path | Notes |
| --- | --- | --- |
| POST | /bookings | Header `Idempotency-Key`. Body: pooja, schedule, date, devotees |
| GET | /bookings | Own bookings. Filters: `status`, `upcoming` |
| GET | /bookings/:id | Own booking only. Includes the QR payload |
| POST | /bookings/:id/cancel |  |
| POST | /bookings/:id/reschedule |  |

**Temple admin and staff** (all under `/admin/temples/:templeId`, guarded by `templeScope`)

| Method | Path | Min role |
| --- | --- | --- |
| GET, PATCH | / | ADMIN |
| GET, POST | /poojas | ADMIN |
| PATCH, DELETE | /poojas/:id | ADMIN |
| GET, POST | /poojas/:id/schedules | ADMIN |
| PATCH, DELETE | /schedules/:id | ADMIN |
| POST | /schedules/:id/block-date | ADMIN |
| GET, POST | /occasions | ADMIN |
| PATCH, DELETE | /occasions/:id | ADMIN |
| GET, POST | /announcements | ADMIN |
| GET, POST, DELETE | /staff | ADMIN |
| GET | /bookings | STAFF. Filters: date, status, pooja, search by code or phone |
| GET | /bookings/:id | STAFF |
| POST | /bookings/check-in | STAFF. Body: QR payload |
| PATCH | /bookings/:id/status | STAFF. Allowed transitions only |
| GET | /reports/summary | ADMIN. Bookings and revenue by day and pooja |
| GET | /bookings/export | ADMIN. CSV |
| POST | /media/images | ADMIN. Multipart image upload, validated, then stored in Cloudinary |

**Super admin** (under `/super`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | /super/temples | Create temple (status `DRAFT`) |
| PATCH | /super/temples/:id/status | Activate or suspend |
| POST | /super/temples/:id/admins | Assign a temple admin by phone number. Creates the user if needed |
| GET | /super/temples | All temples with stats |
| GET | /super/users | Search users. Suspend or reactivate |
| GET | /super/reports/platform | Platform totals |

## 10. Free services and deferred payments

Version 1 uses free tiers only. Each service sits behind a small interface in `src/integrations/`, so replacing a provider changes one file. Free plans and their limits change, so check each plan's current limits before launch.

| Need | Choice | Notes | Upgrade path |
| --- | --- | --- | --- |
| OTP email | Brevo free SMTP plan, sent with Nodemailer | Free daily sending quota. A verified sender address is enough to start | Resend or Amazon SES, then SMS (MSG91) |
| Image storage | Cloudinary free plan | No card needed. Resizes and converts images on delivery, which suits mobile data | Cloudflare R2 or S3 |
| Push notifications | Firebase Cloud Messaging (FCM) | Free, no message quota. Android now, iOS later | None needed |
| Database | Neon or Supabase free PostgreSQL | See Section 15 | A small paid instance |

### Push notifications

FCM is the standard free push service for Android. The app sends its token to `POST /me/devices`, and the server sends messages with `firebase-admin`. Each temple has an FCM topic (`temple_<id>`). Devotees who follow a temple subscribe to it, and an announcement is one send to that topic. Booking confirmations and reminders go to the individual device tokens. Tokens that FCM reports as unregistered are deleted.

Socket.IO is not a replacement for push, because it only reaches the app while it is open. It can be added later for live screens, such as a new booking appearing instantly on the staff screen.

### Email OTP

SMS is not free in India: it needs a paid provider and DLT registration. Version 1 therefore signs in with an email OTP. The auth service has a channel interface, and `users.phone` already exists, so phone OTP (MSG91 or Firebase Phone Auth) can be added later as another route without changing the tables. Many devotees may prefer phone login, so confirm this with the pilot temple (Section 17).

### Image storage

Upload flow: the admin posts the image to `POST /admin/temples/:templeId/media/images` as multipart data. The server rejects anything over 5 MB or not JPEG, PNG, or WebP (checked by file signature), re-encodes it with sharp to strip metadata, and uploads it to Cloudinary under `temples/<templeId>/`. The URL and public ID are saved in `media_assets`. Deleting an image or a temple also deletes the Cloudinary file.

### Payments: not in version 1

A pooja's `price_paise` is shown as the offering amount and is paid at the temple. Nothing in the booking flow depends on payment. To add online payment later: add `payments` and `refunds` tables, add `PENDING_PAYMENT` and `EXPIRED` booking statuses, hold the slot for about 10 minutes using an `expires_at` column and a pg-boss expiry job, and confirm payments through a signature-verified webhook. The atomic slot reservation in Section 7 does not change.

## 11. Background jobs (pg-boss)

| Job | Schedule | Purpose |
| --- | --- | --- |
| generate-slot-inventory | Nightly | Create inventory rows for the booking window |
| booking-reminders | Hourly | Push a reminder the day before |
| complete-past-bookings | Nightly | Mark old confirmed bookings `COMPLETED` or `NO_SHOW` |
| send-announcement-push | On demand | Send an announcement to a temple's FCM topic |
| cleanup | Daily | Delete expired OTP codes, expired or revoked sessions, and stale device tokens |

Jobs run on pg-boss, which keeps its queue in PostgreSQL, so there is no Redis to host. Jobs retry with backoff, use singleton keys so two instances never run the same schedule, and are safe to run twice. Free hosts that put an idle app to sleep also pause its scheduler, so use a host that stays awake, or trigger the jobs from a free external cron service.

## 12. Security checklist

- **Transport:** HTTPS only. Redirect HTTP, send HSTS, and use TLS for the database connection. Set Express `trust proxy` to the exact number of proxies in front of the app, so client IPs and rate limits are correct.
- **Headers and CORS:** Helmet defaults, `x-powered-by` removed, and a strict CORS allowlist from `CORS_ORIGINS` with no wildcard.
- **Input:** every body, query, and path parameter is validated by a strict Zod schema that rejects unknown fields, which stops mass assignment. IDs must be UUIDs. JSON bodies are limited to 100 KB. List endpoints cap `limit` at 100.
- **Database access:** Prisma only, always parameterised. `$queryRawUnsafe` and `$executeRawUnsafe` are banned by an ESLint rule.
- **Authentication:** Section 8. argon2id for passwords, hashed OTPs and refresh tokens, constant-time comparison, lockout, and identical responses for known and unknown emails.
- **Authorization:** deny by default. Every route declares the roles it allows. Ownership is checked on every row: `userId` for devotees and `templeId` for staff (Section 4).
- **Responses:** explicit response schemas. A full database row is never returned, and password hashes, tokens, and internal fields are never serialised.
- **Rate limits:** global per IP, strict on `/auth/*` and booking creation, moderate on public search.
- **Uploads:** images only, 5 MB maximum, type checked by file signature, re-encoded to remove metadata such as GPS, random file names. The server never fetches a user-supplied URL.
- **CSV export:** cells that start with `=`, `+`, `-`, or `@` are prefixed so spreadsheet programs cannot run them as formulas.
- **QR codes** carry an HMAC-signed payload that is checked against the booking and the staff member's temple.
- **Secrets:** environment variables or the host's secret store only, never in git, different per environment, rotated after any suspected leak. GitHub secret scanning is switched on.
- **Dependencies:** lockfile committed, `npm audit` in CI, Dependabot enabled, few dependencies, and CI jobs with least privilege.
- **Logging:** structured logs with a request ID. Tokens, OTPs, cookies, and authorization headers are redacted and emails are masked. Every admin change is written to `audit_logs`.
- **Errors:** generic messages and no stack traces for clients in production.
- **Personal data:** collect only what is needed, publish a privacy policy, and support account deletion. `DELETE /me` anonymises the user and keeps booking rows for the temple's records.
- **Infrastructure:** the container runs as a non-root user, holds no secrets in the image, and uses the least-privilege database role from Section 6.4. Backups are automatic.

### OWASP API Security Top 10 (2023) coverage

| Risk | Control in this design |
| --- | --- |
| API1 Broken object level authorization | `templeScope` middleware, ownership checks on every row, 404 for foreign rows, isolation tests |
| API2 Broken authentication | OTP limits, hashed secrets, refresh rotation with reuse detection, lockout |
| API3 Broken object property level authorization | Strict request schemas and explicit response schemas |
| API4 Unrestricted resource consumption | Body and upload limits, pagination caps, rate limits |
| API5 Broken function level authorization | Roles declared per route, role matrix tests |
| API6 Unrestricted access to sensitive business flows | Booking and cancel limits, idempotency keys, OTP limits |
| API7 Server side request forgery | The server never fetches user-supplied URLs |
| API8 Security misconfiguration | Helmet, strict CORS, no stack traces, config validated at startup, non-root container |
| API9 Improper inventory management | The OpenAPI file is the single list of endpoints, one API version in production, no debug routes |
| API10 Unsafe consumption of APIs | Responses from Brevo, Cloudinary, and FCM are validated and never trusted as input |

## 13. Environment configuration

```
NODE_ENV, PORT, TRUST_PROXY_HOPS, RUN_JOBS
DATABASE_URL                       (application role, TLS)
MIGRATION_DATABASE_URL             (migration role, used only in the release step)
JWT_PRIVATE_KEY, JWT_PUBLIC_KEY    (Ed25519)
JWT_ISSUER, JWT_AUDIENCE
OTP_HMAC_SECRET, QR_SIGNING_SECRET
EMAIL_PROVIDER                     (brevo or console; console is refused in production)
BREVO_SMTP_HOST, BREVO_SMTP_PORT, BREVO_SMTP_USER, BREVO_SMTP_KEY, EMAIL_FROM
CLOUDINARY_URL
FCM_SERVICE_ACCOUNT_JSON
SENTRY_DSN
CORS_ORIGINS
```

The app validates all of these at startup and refuses to boot if any is missing.

## 14. Testing strategy

- **Unit tests:** booking state machine, cancellation rules, slot date generation, OTP hashing and comparison.
- **Integration tests** with Vitest, Supertest, and Testcontainers against a real PostgreSQL, not mocks:
  - 50 concurrent requests for the last 3 seats. Exactly 3 succeed.
  - Replaying an idempotency key returns the same booking.
  - An expired, reused, or over-attempted OTP is rejected.
  - Reusing an old refresh token revokes the whole session family.
- **Tenant isolation tests:** Temple A's admin against every Temple B endpoint.
- **Role matrix tests:** each role against each endpoint group.
- **Security tests:** every protected route returns 401 without a token, unknown body fields are rejected, oversized bodies are rejected, a fake image upload is rejected, and rate limits trigger.
- CI runs lint, type check, tests, and `npm audit` on every push.

## 15. Deployment and operations

- **Environments:** local (Docker Compose with PostgreSQL 18), staging, production.
- **Free hosting for the pilot:** the API on a free web service such as Render or Koyeb, and PostgreSQL on Neon or Supabase free. Check each plan's current limits. Free web services usually sleep when idle, so the first request is slow and the scheduler pauses (Section 11). Free databases may scale to zero, so the app retries the first connection. Move to a small paid instance before opening the platform to many temples.
- **Container:** one multi-stage Dockerfile, Node.js slim image, `npm ci --omit=dev`, non-root user, and a health check.
- **Migrations:** `prisma migrate deploy` in the release step, using the migration role. Migrations stay backward compatible with the previous app version.
- **Backups:** a scheduled GitHub Actions workflow runs `pg_dump` nightly and stores the encrypted dump outside the database provider. Test a restore at least once before launch.
- **Monitoring:** Sentry free plan for errors, and a free uptime checker such as UptimeRobot calling `/health`.
- **CI and CD:** GitHub Actions runs lint, type check, tests, `npm audit`, build, and deploy. Dependabot opens upgrade pull requests.

## 16. Build order for the backend

| Step | Work | Done when |
| --- | --- | --- |
| 1 | Repo, Node.js, TypeScript, Express 5, ESLint, Prettier, Vitest, Docker Compose, env validation, CI | App boots, connects to PostgreSQL, CI is green |
| 2 | Prisma schema, first migration, raw SQL checks, seed script with one demo temple and a super admin | Tables and constraints exist, seed runs |
| 3 | Core middleware: request ID, pino logger, Helmet, CORS, rate limits, validation, error handler | Security headers and the error format are tested |
| 4 | Auth: email OTP, JWT, refresh rotation, role middleware, super admin login | Auth tests pass |
| 5 | Temples, staff, `templeScope`, super admin APIs | Super admin creates a temple and assigns an admin. Isolation tests pass |
| 6 | Poojas, schedules, occasions, Cloudinary image upload | Admin builds a full temple. Public read APIs work |
| 7 | Slot inventory and availability | Availability API returns correct seats |
| 8 | Booking engine, state service, cancel, reschedule, jobs | Concurrency tests pass |
| 9 | Check-in QR, admin booking views, safe CSV export | Staff can run a day's bookings |
| 10 | FCM push, announcements, reminders, reports | Reminders and reports work |
| 11 | Hardening: OpenAPI review, dependency audit, load test, backup restore test, review against Section 12 | Launch checklist complete |

Publish the OpenAPI spec after step 5, so the admin panel and the app can start building against it.

## 17. Open decisions to settle with the pilot temple

1. Is email OTP enough at launch, or do devotees need phone OTP from day one? Phone OTP needs a paid SMS provider or Firebase Phone Auth.
2. Can one devotee book the same pooja twice on the same day?
3. Is slot capacity counted per devotee or per booking?
4. What is the cancellation cutoff?
5. Who confirms occasion dates each year, and how far ahead are they published?
6. Do any poojas need approval by the temple before confirmation (for example a special vazhipadu)? If yes, a `PENDING_APPROVAL` status is added.
7. When payment is added later, is it online, at the counter, or both?
