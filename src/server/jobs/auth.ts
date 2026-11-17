import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Shared authentication for cron-triggered job routes.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every request when
 * the project has CRON_SECRET set. Manual invocations (curl, CI smoke checks)
 * must supply the same header, so one code path protects both. If CRON_SECRET
 * is unset or too short the job is disabled rather than left open.
 */
export function requireJobSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const actual = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(expected ?? "");
  const authorized =
    expected !== undefined &&
    expected.length >= 32 &&
    actual.length === wanted.length &&
    timingSafeEqual(actual, wanted);

  if (!authorized) {
    if (!expected) console.error("[jobs] CRON_SECRET is not configured; refusing to run");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
