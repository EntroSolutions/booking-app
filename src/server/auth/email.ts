// Magic-link delivery.
//
// - With RESEND_API_KEY set, the link is emailed through the Resend HTTP API.
// - Without a key (local development), the link is printed to the server
//   console instead so you can sign in without an email provider.
// - In production a missing key is an error; links are never logged there.

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

export async function sendMagicLink({
  identifier,
  url,
  from,
  expires,
}: MagicLinkParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY must be set to send sign-in emails.");
    }
    console.info(
      `\n[auth] RESEND_API_KEY not set - sign-in link for ${identifier}:\n${url}\n` +
        `[auth] Link expires at ${expires.toISOString()}\n`,
    );
    return;
  }

  const safeUrl = escapeHtml(url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from ?? process.env.EMAIL_FROM,
      to: identifier,
      subject: "Your sign-in link",
      text: `Sign in to Booking App:\n${url}\n\nThis link expires soon and can only be used once. If you did not request it, ignore this email.`,
      html: `<p>Sign in to Booking App:</p><p><a href="${safeUrl}">Sign in</a></p><p>This link expires soon and can only be used once. If you did not request it, ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    // Do not include the response body: it may echo request details.
    throw new Error(`Failed to send sign-in email (status ${response.status}).`);
  }
}
