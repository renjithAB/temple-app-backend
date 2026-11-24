-- ==============================================================================
-- Cloudflare D1 Migration: 0002_payments_pooja_settings.sql
-- Description: Razorpay payment gateway, dual approval, counter/online refunds,
--              one-time special poojas, booking time limits, fee split & platform settings.
-- ==============================================================================

-- 1. Temple Online Payment & Refund Governance
ALTER TABLE "temples" ADD COLUMN "super_admin_online_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "temples" ADD COLUMN "temple_admin_online_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "temples" ADD COLUMN "super_admin_online_refund" BOOLEAN NOT NULL DEFAULT false;

-- 2. One-Time Special Day Pooja & Booking Cutoff Limits
ALTER TABLE "poojas" ADD COLUMN "is_one_time" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "poojas" ADD COLUMN "one_time_date" DATETIME;
ALTER TABLE "poojas" ADD COLUMN "one_time_start_time" TEXT;
ALTER TABLE "poojas" ADD COLUMN "one_time_end_time" TEXT;
ALTER TABLE "poojas" ADD COLUMN "one_time_capacity" INTEGER;
ALTER TABLE "poojas" ADD COLUMN "booking_cutoff_hours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "poojas" ADD COLUMN "daily_cutoff_time" TEXT;

-- 3. Booking Payment Tracking, Refunds & Fee Split
ALTER TABLE "bookings" ADD COLUMN "payment_mode" TEXT NOT NULL DEFAULT 'PAY_AT_COUNTER';
ALTER TABLE "bookings" ADD COLUMN "payment_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "bookings" ADD COLUMN "gateway_order_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "gateway_payment_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "gateway_signature" TEXT;
ALTER TABLE "bookings" ADD COLUMN "paid_at" DATETIME;
ALTER TABLE "bookings" ADD COLUMN "refund_status" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "bookings" ADD COLUMN "refund_amount_paise" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "refunded_at" DATETIME;
ALTER TABLE "bookings" ADD COLUMN "refunded_by_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "refund_notes" TEXT;
ALTER TABLE "bookings" ADD COLUMN "seva_amount_paise" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "platform_fee_paise" INTEGER DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "gateway_fee_paise" INTEGER DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "gst_paise" INTEGER DEFAULT 0;

-- 4. Processed Webhooks for Razorpay Idempotency
CREATE TABLE IF NOT EXISTS "processed_webhooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "processed_webhooks_event_id_key" ON "processed_webhooks"("event_id");

-- 5. Platform Settings (Platform Fee %, Gateway %, Future GST Toggle)
CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "platform_fee_percent" REAL NOT NULL DEFAULT 2.5,
    "gateway_fee_percent" REAL NOT NULL DEFAULT 2.0,
    "gst_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gst_percent" REAL NOT NULL DEFAULT 18.0,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default platform settings row
INSERT OR IGNORE INTO "platform_settings" ("id", "platform_fee_percent", "gateway_fee_percent", "gst_enabled", "gst_percent", "updated_at")
VALUES ('default', 2.5, 2.0, false, 18.0, CURRENT_TIMESTAMP);

