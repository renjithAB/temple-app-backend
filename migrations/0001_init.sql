-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'DEVOTEE',
    "password_hash" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" DATETIME,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'VERIFICATION',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME NOT NULL,
    "consumed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nakshatra" TEXT,
    "gotra" TEXT,
    "relation" TEXT,
    CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "temples" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "latitude" DECIMAL,
    "longitude" DECIMAL,
    "phone" TEXT,
    "email" TEXT,
    "cover_image_url" TEXT,
    "opening_hours" JSONB,
    "booking_advance_days" INTEGER NOT NULL DEFAULT 60,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "temple_staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "temple_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "temple_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "temple_staff_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "temple_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "poojas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "temple_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "description" TEXT,
    "price_paise" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER,
    "max_devotees_per_booking" INTEGER NOT NULL DEFAULT 5,
    "requires_booking" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "poojas_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pooja_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pooja_id" TEXT NOT NULL,
    "temple_id" TEXT NOT NULL,
    "weekday" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "pooja_schedules_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "slot_inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schedule_id" TEXT NOT NULL,
    "temple_id" TEXT NOT NULL,
    "slot_date" DATETIME NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "slot_inventory_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "pooja_schedules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "occasions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "temple_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ml" TEXT,
    "description" TEXT,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "start_time" TEXT,
    "is_recurring_yearly" BOOLEAN NOT NULL DEFAULT false,
    "image_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "occasions_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "occasion_poojas" (
    "occasion_id" TEXT NOT NULL,
    "pooja_id" TEXT NOT NULL,

    PRIMARY KEY ("occasion_id", "pooja_id"),
    CONSTRAINT "occasion_poojas_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "occasion_poojas_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "temple_id" TEXT NOT NULL,
    "pooja_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "occasion_id" TEXT,
    "booking_date" DATETIME NOT NULL,
    "start_time" TEXT NOT NULL,
    "devotee_count" INTEGER NOT NULL,
    "unit_price_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "idempotency_key" TEXT,
    "note" TEXT,
    "checked_in_at" DATETIME,
    "checked_in_by_id" TEXT,
    "cancelled_at" DATETIME,
    "cancel_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookings_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookings_pooja_id_fkey" FOREIGN KEY ("pooja_id") REFERENCES "poojas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "pooja_schedules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bookings_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "occasions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "booking_devotees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "booking_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nakshatra" TEXT,
    "gotra" TEXT,
    CONSTRAINT "booking_devotees_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "booking_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by_id" TEXT,
    "reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "temple_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publish_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_push" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "deleted_at" DATETIME,
    CONSTRAINT "announcements_temple_id_fkey" FOREIGN KEY ("temple_id") REFERENCES "temples" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "temple_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes"("email", "created_at");

-- CreateIndex
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");

-- CreateIndex
CREATE INDEX "family_members_user_id_idx" ON "family_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_fcm_token_key" ON "device_tokens"("fcm_token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "temples_slug_key" ON "temples"("slug");

-- CreateIndex
CREATE INDEX "temples_district_idx" ON "temples"("district");

-- CreateIndex
CREATE INDEX "temples_status_deleted_at_idx" ON "temples"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "temple_staff_temple_id_idx" ON "temple_staff"("temple_id");

-- CreateIndex
CREATE UNIQUE INDEX "temple_staff_user_id_temple_id_key" ON "temple_staff"("user_id", "temple_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_public_id_key" ON "media_assets"("public_id");

-- CreateIndex
CREATE INDEX "media_assets_temple_id_idx" ON "media_assets"("temple_id");

-- CreateIndex
CREATE INDEX "poojas_temple_id_is_active_idx" ON "poojas"("temple_id", "is_active");

-- CreateIndex
CREATE INDEX "pooja_schedules_temple_id_idx" ON "pooja_schedules"("temple_id");

-- CreateIndex
CREATE UNIQUE INDEX "pooja_schedules_pooja_id_weekday_start_time_key" ON "pooja_schedules"("pooja_id", "weekday", "start_time");

-- CreateIndex
CREATE INDEX "slot_inventory_temple_id_slot_date_idx" ON "slot_inventory"("temple_id", "slot_date");

-- CreateIndex
CREATE UNIQUE INDEX "slot_inventory_schedule_id_slot_date_key" ON "slot_inventory"("schedule_id", "slot_date");

-- CreateIndex
CREATE INDEX "occasions_temple_id_start_date_idx" ON "occasions"("temple_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_temple_id_booking_date_status_idx" ON "bookings"("temple_id", "booking_date", "status");

-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key" ON "bookings"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "booking_devotees_booking_id_idx" ON "booking_devotees"("booking_id");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history"("booking_id");

-- CreateIndex
CREATE INDEX "announcements_temple_id_publish_at_idx" ON "announcements"("temple_id", "publish_at");

-- CreateIndex
CREATE INDEX "audit_logs_temple_id_created_at_idx" ON "audit_logs"("temple_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

