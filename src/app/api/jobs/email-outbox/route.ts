import { type NextRequest, NextResponse } from "next/server";
import { processEmailOutbox } from "@/server/email/process-outbox";
import { serverNow } from "@/server/clock";
import { requireJobSecret } from "@/server/jobs/auth";

export const runtime = "nodejs";
// Vercel Cron allows up to 10s on Hobby and up to 5 min on Pro.
export const maxDuration = 60;

/**
 * Scheduled by vercel.json (every 10 minutes). The secret is checked before any
 * database access; batches of 25 keep each run well inside the serverless
 * timeout on the free tier.
 */
export async function GET(request: NextRequest) {
  const denied = requireJobSecret(request);
  if (denied) return denied;

  try {
    const result = await processEmailOutbox(25, serverNow());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[email-outbox] run failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "outbox_run_failed" }, { status: 500 });
  }
}
