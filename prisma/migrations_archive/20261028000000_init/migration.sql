-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create Enums
CREATE TYPE "GlobalRole" AS ENUM ('DEVOTEE', 'SUPER_ADMIN');
CREATE TYPE "TempleRole" AS ENUM ('STAFF', 'ADMIN');
CREATE TYPE "TempleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateTable users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "role" "GlobalRole" NOT NULL DEFAULT 'DEVOTEE',
    "password_hash" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable otp_codes
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable family_members
CREATE TABLE "family_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nakshatra" TEXT,
    "gotra" TEXT,
    "relation" TEXT,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable refresh_sessions
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable device_tokens
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable temples
CREATE TABLE "temples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "deity" TEXT NOT NULL,
    "description" TEXT,
    "description_ml" TEXT,
    "address_line" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Kerala',
    "pincode" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT,
    "email" TEXT,
    "cover_image_url" TEXT,
    "opening_hours" JSONB,
    "booking_advance_days" INTEGER NOT NULL DEFAULT 60,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
    "status" "TempleStatus" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "temples_pkey" PRIMARY KEY ("id")
);

-- CreateTable temple_staff
CREATE TABLE "temple_staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "temple_id" UUID NOT NULL,
    "role" "TempleRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temple_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable media_assets
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "temple_id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable poojas
CREATE TABLE "poojas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "temple_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "description" TEXT,
    "price_paise" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER,
    "max_devotees_per_booking" INTEGER NOT NULL DEFAULT 5,
    "requires_booking" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "poojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable pooja_schedules
CREATE TABLE "pooja_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pooja_id" UUID NOT NULL,
    "temple_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pooja_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable slot_inventory
CREATE TABLE "slot_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "temple_id" UUID NOT NULL,
    "slot_date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "slot_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable occasions
CREATE TABLE "occasions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "temple_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TEXT,
    "is_recurring_yearly" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "occasions_pkey" PRIMARY KEY ("id")
);

-- CreateTable occasion_poojas
CREATE TABLE "occasion_poojas" (
    "occasion_id" UUID NOT NULL,
    "pooja_id" UUID NOT NULL,

    CONSTRAINT "occasion_poojas_pkey" PRIMARY KEY ("occasion_id","pooja_id")
);

-- CreateTable bookings
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "temple_id" UUID NOT NULL,
    "pooja_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "occasion_id" UUID,
    "booking_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "devotee_count" INTEGER NOT NULL,
    "unit_price_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotency_key" TEXT,
    "note" TEXT,
    "checked_in_at" TIMESTAMPTZ(3),
    "checked_in_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable booking_devotees
CREATE TABLE "booking_devotees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nakshatra" TEXT,
    "gotra" TEXT,

    CONSTRAINT "booking_devotees_pkey" PRIMARY KEY ("id")
);

-- CreateTable booking_status_history
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable announcements
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "temple_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publish_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_push" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable audit_logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "temple_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes"("email", "created_at");
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");
CREATE INDEX "family_members_user_id_idx" ON "family_members"("user_id");
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");
CREATE UNIQUE INDEX "device_tokens_fcm_token_key" ON "device_tokens"("fcm_token");
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");
CREATE UNIQUE INDEX "temples_slug_key" ON "temples"("slug");
CREATE INDEX "temples_district_idx" ON "temples"("district");
CREATE INDEX "temples_status_deleted_at_idx" ON "temples"("status", "deleted_at");
CREATE UNIQUE INDEX "temple_staff_user_id_temple_id_key" ON "temple_staff"("user_id", "temple_id");
CREATE INDEX "temple_staff_temple_id_idx" ON "temple_staff"("temple_id");
CREATE UNIQUE INDEX "media_assets_public_id_key" ON "media_assets"("public_id");
CREATE INDEX "media_assets_temple_id_idx" ON "media_assets"("temple_id");
CREATE INDEX "poojas_temple_id_is_active_idx" ON "poojas"("temple_id", "is_active");
CREATE UNIQUE INDEX "pooja_schedules_pooja_id_weekday_start_time_key" ON "pooja_schedules"("pooja_id", "weekday", "start_time");
CREATE INDEX "pooja_schedules_temple_id_idx" ON "pooja_schedules"("temple_id");
CREATE UNIQUE INDEX "slot_inventory_schedule_id_slot_date_key" ON "slot_inventory"("schedule_id", "slot_date");
CREATE INDEX "slot_inventory_temple_id_slot_date_idx" ON "slot_inventory"("temple_id", "slot_date");
CREATE INDEX "occasions_temple_id_start_date_idx" ON "occasions"("temple_id", "start_date");
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");
CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key" ON "bookings"("user_id", "idempotency_key");
CREATE INDEX "bookings_temple_id_booking_date_status_idx" ON "bookings"("temple_id", "booking_date", "status");
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");
CREATE INDEX "booking_devotees_booking_id_idx" ON "booking_devotees"("booking_id");
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history"("booking_id");
CREATE INDEX "announcements_temple_id_publish_at_idx" ON "announcements"("temple_id", "publish_at");
CREATE INDEX "audit_logs_temple_id_created_at_idx" ON "audit_logs"("temple_id", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- Foreign Keys
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "temple_staff" ADD CONSTRAINT "temple_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "temple_staff" ADD CONSTRAINT "temple_staff_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "poojas" ADD CONSTRAINT "poojas_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pooja_schedules" ADD CONSTRAINT "pooja_schedules_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "slot_inventory" ADD CONSTRAINT "slot_inventory_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "pooja_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "occasion_poojas" ADD CONSTRAINT "occasion_poojas_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "occasion_poojas" ADD CONSTRAINT "occasion_poojas_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "pooja_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_devotees" ADD CONSTRAINT "booking_devotees_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Section 6.4 Hand-crafted SQL Check Constraints and Rules:
ALTER TABLE "slot_inventory" ADD CONSTRAINT "check_slot_inventory_capacity" CHECK (capacity >= 0 AND booked >= 0 AND booked <= capacity);
ALTER TABLE "bookings" ADD CONSTRAINT "check_bookings_devotee_count_and_total" CHECK (devotee_count > 0 AND total_paise >= 0);
ALTER TABLE "occasions" ADD CONSTRAINT "check_occasions_date_range" CHECK (end_date >= start_date);
ALTER TABLE "users" ADD CONSTRAINT "check_users_email_lowercase" CHECK (email = lower(email));
ALTER TABLE "pooja_schedules" ADD CONSTRAINT "check_pooja_schedules_start_time" CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "occasions" ADD CONSTRAINT "check_occasions_start_time" CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "bookings" ADD CONSTRAINT "check_bookings_start_time" CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Partial Unique Index (one active confirmed booking per devotee per schedule per date)
CREATE UNIQUE INDEX "unique_active_user_schedule_date" ON "bookings"("user_id", "schedule_id", "booking_date") WHERE status = 'CONFIRMED';

-- Trigram search indexes
CREATE INDEX "temples_name_trgm_idx" ON "temples" USING gin ("name" gin_trgm_ops);
CREATE INDEX "temples_deity_trgm_idx" ON "temples" USING gin ("deity" gin_trgm_ops);

-- Location index for coordinates
CREATE INDEX "temples_lat_lng_idx" ON "temples"("latitude", "longitude");
