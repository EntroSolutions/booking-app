import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailOutbox } from "@prisma/client";
import { isE2eHarnessEnabled } from "@/server/clock";
import { HttpError } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";

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

/** Development mode: write a 0600 preview file instead of calling a provider. */
async function saveLocalEmail(email: {
  kind: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const directory = path.join(process.cwd(), ".local-outbox");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `session-email-${randomUUID()}.json`;
  await writeFile(
    path.join(directory, filename),
    JSON.stringify(
      {
        kind: email.kind,
        recipient: email.recipient,
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  // Log the file name only: recipients and bodies stay out of the console.
  logger.info("email.outbox.saved", { outboxFile: filename });
}

/**
 * Deliver one already-claimed outbox row. Resolves with the provider message
 * id (never logged); throws on any failure so the outbox can retry.
 */
export async function deliverOutboxEmail(
  email: EmailOutbox,
): Promise<string | null> {
  assertEmailDeliveryConfigured();
  if (process.env.EMAIL_DELIVERY === "local") {
    await saveLocalEmail(email);
    return null;
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
      html: email.html || `<p>${email.text}</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email provider rejected the message");

  // Only the id is read: a provider error body could echo secrets.
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;
  return typeof payload?.id === "string" ? payload.id : null;
}
