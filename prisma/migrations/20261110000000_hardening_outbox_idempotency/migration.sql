-- Idempotent reservation mutations and transactional confirmation email.

CREATE TYPE "EmailKind" AS ENUM (
  'BOOKING_CONFIRMATION',
  'CANCELLATION_CONFIRMATION'
);
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "idempotency_records" (
  "key" TEXT NOT NULL,
  "reservation_id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "email_outbox" (
  "id" TEXT NOT NULL,
  "reservation_id" TEXT NOT NULL,
  "kind" "EmailKind" NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_outbox_attempts_nonnegative" CHECK ("attempts" >= 0)
);

CREATE INDEX "idempotency_expires_idx"
  ON "idempotency_records"("expires_at");
CREATE INDEX "idempotency_reservation_idx"
  ON "idempotency_records"("reservation_id");
CREATE UNIQUE INDEX "email_outbox_reservation_kind_unique"
  ON "email_outbox"("reservation_id", "kind");
CREATE INDEX "email_outbox_delivery_idx"
  ON "email_outbox"("status", "available_at");

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
