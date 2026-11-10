// Magic-link delivery. Production uses Resend. Local development writes a
// mode-0600 file instead of placing credentials or magic-link tokens in logs.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "@/server/observability/logger";

type MagicLinkParams = {
  identifier: string;
  url: string;
  from?: string;
  expires: Date;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function saveLocalMagicLink(params: MagicLinkParams): Promise<void> {
  const directory = path.join(process.cwd(), ".local-outbox");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `magic-link-${randomUUID()}.json`;
  await writeFile(
    path.join(directory, filename),
    JSON.stringify(
      {
        recipient: params.identifier,
        url: params.url,
        expiresAt: params.expires.toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  logger.info("auth.magic_link.saved", { outboxFile: filename });
}

export async function sendMagicLink(params: MagicLinkParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Magic-link email delivery is not configured");
    }
    await saveLocalMagicLink(params);
    return;
  }

  const safeUrl = escapeHtml(params.url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from ?? process.env.EMAIL_FROM,
      to: params.identifier,
      subject: "Your sign-in link",
      text: `Sign in to Booking App:\n${params.url}\n\nThis link expires soon and can only be used once. If you did not request it, ignore this email.`,
      html: `<p>Sign in to Booking App:</p><p><a href="${safeUrl}">Sign in</a></p><p>This link expires soon and can only be used once. If you did not request it, ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Do not include a response body: providers can echo secrets or recipients.
    throw new Error("Magic-link provider rejected the message");
  }
}
