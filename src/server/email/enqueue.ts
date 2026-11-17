// Outbox writes for reservation notifications.
//
// Everything here runs inside the caller's Prisma transaction: if the booking
// or cancellation commits, its emails are already durable rows. Email delivery
// itself never happens here, so a provider outage can only delay a message,
// never lose one or roll back a reservation.
import type { Prisma, EmailKind } from "@prisma/client";
import {
  bookingConfirmationEmails,
  cancellationEmails,
  type EmailParticipant,
  type SessionEmailData,
} from "@/lib/email/templates";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Clients have no stored time zone yet; UTC is the documented fallback. */
function defaultClientTimeZone(): string {
  return process.env.DEFAULT_CLIENT_TIME_ZONE || "UTC";
}

function participant(
  name: string | null,
  email: string,
  timeZone: string,
): EmailParticipant {
  return { name, email, timeZone };
}

function sessionData(input: {
  reservationId: string;
  startsAt: Date;
  endsAt: Date;
  status: "confirmed" | "cancelled";
  client: { name: string | null; email: string };
  coach: { name: string | null; email: string; timeZone: string };
  cancelReason?: string | null;
}): SessionEmailData {
  return {
    reservationId: input.reservationId,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    status: input.status,
    client: participant(
      input.client.name,
      input.client.email,
      defaultClientTimeZone(),
    ),
    coach: participant(input.coach.name, input.coach.email, input.coach.timeZone),
    dashboardBaseUrl: appUrl(),
    cancelReason: input.cancelReason ?? null,
  };
}

function rowsFor(
  drafts: ReturnType<typeof bookingConfirmationEmails>,
  now: Date,
) {
  return drafts.map((draft) => ({
    kind: draft.kind as EmailKind,
    recipient: draft.recipient,
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Enqueue the client and coach copies of a booking confirmation. Idempotent:
 * replays (same reservation, same kind, same recipient) are ignored so a
 * retried booking transaction never produces duplicate rows.
 */
export async function enqueueBookingConfirmationEmails(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    startsAt: Date;
    endsAt: Date;
    client: { name: string | null; email: string };
    coach: { name: string | null; email: string; timeZone: string };
    now: Date;
  },
): Promise<void> {
  const drafts = bookingConfirmationEmails(
    sessionData({ ...input, status: "confirmed" }),
  );
  await tx.emailOutbox.createMany({
    data: rowsFor(drafts, input.now),
    skipDuplicates: true,
  });
}

/**
 * Enqueue the client and coach copies of a cancellation notice. Upserting per
 * recipient keeps a concurrent or replayed cancellation from duplicating rows.
 */
export async function enqueueCancellationEmails(
  tx: Prisma.TransactionClient,
  input: {
    reservationId: string;
    startsAt: Date;
    endsAt: Date;
    client: { name: string | null; email: string };
    coach: { name: string | null; email: string; timeZone: string };
    cancelReason: string | null;
    now: Date;
  },
): Promise<void> {
  const drafts = cancellationEmails(
    sessionData({ ...input, status: "cancelled" }),
  );
  for (const draft of drafts) {
    await tx.emailOutbox.upsert({
      where: {
        reservationId_kind_recipient: {
          reservationId: input.reservationId,
          kind: draft.kind as EmailKind,
          recipient: draft.recipient,
        },
      },
      update: {},
      create: {
        reservationId: input.reservationId,
        kind: draft.kind as EmailKind,
        recipient: draft.recipient,
        subject: draft.subject,
        text: draft.text,
        html: draft.html,
        availableAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
  }
}
