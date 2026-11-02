-- Initial schema for the booking domain.
-- Created with `prisma migrate dev` against the schema in prisma/schema.prisma.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bio" TEXT,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_availability" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "weekly_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_unavailable" BOOLEAN NOT NULL DEFAULT false,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "reason" TEXT,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_user_id_key" ON "coach_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_availability_unique_slot" ON "weekly_availability"("coach_id", "weekday", "start_minute");

-- CreateIndex
CREATE INDEX "weekly_availability_coach_weekday_idx" ON "weekly_availability"("coach_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "availability_exception_unique" ON "availability_exceptions"("coach_id", "date", "start_minute");

-- CreateIndex
CREATE INDEX "availability_exception_coach_date_idx" ON "availability_exceptions"("coach_id", "date");

-- CreateIndex
CREATE INDEX "reservation_coach_starts_idx" ON "reservations"("coach_id", "starts_at");

-- CreateIndex
CREATE INDEX "reservation_client_starts_idx" ON "reservations"("client_id", "starts_at");

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks: reject invalid availability intervals and windows.
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_valid_interval"
  CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");

ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exception_valid_window"
  CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute")
  );

ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exception_window_shape"
  CHECK (("is_unavailable" = false) OR ("start_minute" IS NOT NULL));

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_valid_interval"
  CHECK ("starts_at" < "ends_at");

-- Double-booking prevention: no two *active* reservations for the same coach
-- may overlap in time. Evaluated at the database level so concurrent
-- transactions cannot race past application-level checks.
ALTER TABLE "reservations" ADD CONSTRAINT "reservation_no_overlap"
  EXCLUDE USING gist (
    "coach_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" IN ('PENDING', 'CONFIRMED'));
