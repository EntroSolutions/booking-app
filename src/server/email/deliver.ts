import type { EmailOutbox } from "@prisma/client";
import { isE2eHarnessEnabled } from "@/server/clock";
import { HttpError } from "@/server/http/errors";

export function assertEmailDeliveryConfigured(): void {
  const local =
    process.env.EMAIL_DELIVERY === "local" &&
    (process.env.NODE_ENV !== "production" || isE2eHarnessEnabled());
  if (!local && !process.env.RESEND_API_KEY) {
    throw new HttpError(
      503,
      "EMAIL_DELIVERY_UNAVAILABLE",
      "Email delivery is temporarily unavailable.",
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Deliver one already-claimed outbox row; provider responses are never exposed. */
export async function deliverOutboxEmail(email: EmailOutbox): Promise<void> {
  assertEmailDeliveryConfigured();
  if (process.env.EMAIL_DELIVERY === "local") {
    // Local delivery intentionally does not print recipients or message bodies.
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: email.recipient,
      subject: email.subject,
      text: email.text,
      html: `<p>${escapeHtml(email.text)}</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email provider rejected the message");
}
