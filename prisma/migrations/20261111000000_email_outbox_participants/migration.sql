-- Transactional emails go to each participant (client and coach), not one
-- message per event, and store the rendered HTML next to the plain text.

DROP INDEX IF EXISTS "email_outbox_reservation_kind_unique";

ALTER TABLE "email_outbox" ADD COLUMN "html" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "email_outbox_reservation_kind_recipient_unique"
  ON "email_outbox"("reservation_id", "kind", "recipient");

ALTER TABLE "email_outbox" ADD COLUMN "provider_message_id" TEXT;
