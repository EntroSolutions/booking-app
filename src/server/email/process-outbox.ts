import { prisma } from "@/server/db";
import { serverNow } from "@/server/clock";
import { deliverOutboxEmail } from "./deliver";

export interface OutboxRunResult {
  claimed: number;
  sent: number;
  failed: number;
}

/** Bounded retries: permanent failure after this many delivery attempts. */
export const MAX_EMAIL_ATTEMPTS = 5;

/**
 * Claim a bounded batch using optimistic transitions. Concurrent workers cannot
 * send the same row, and stale PROCESSING rows become eligible after five minutes.
 */
export async function processEmailOutbox(
  batchSize = 25,
  now = serverNow(),
): Promise<OutboxRunResult> {
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const candidates = await prisma.emailOutbox.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "FAILED"] },
          availableAt: { lte: now },
          attempts: { lt: MAX_EMAIL_ATTEMPTS },
        },
        { status: "PROCESSING", updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(50, batchSize)),
  });

  const result: OutboxRunResult = { claimed: 0, sent: 0, failed: 0 };
  for (const candidate of candidates) {
    const claim = await prisma.emailOutbox.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        updatedAt: now,
        lastError: null,
      },
    });
    if (claim.count !== 1) continue;
    result.claimed += 1;

    try {
      const providerMessageId = await deliverOutboxEmail({
        ...candidate,
        status: "PROCESSING",
      });
      await prisma.emailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: "SENT",
          sentAt: now,
          updatedAt: now,
          lastError: null,
          // Resend returns an id string; keep it without logging it.
          providerMessageId: providerMessageId ?? null,
        },
      });
      result.sent += 1;
    } catch {
      const attempts = candidate.attempts + 1;
      const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
      const delay = Math.min(2 ** attempts * 60_000, 60 * 60_000);
      await prisma.emailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: "FAILED",
          availableAt: exhausted
            ? // Exhausted attempts are never re-claimed by this query.
              candidate.availableAt
            : new Date(now.getTime() + delay),
          updatedAt: now,
          // Stable classification only: no provider response, recipient or body.
          lastError: "DELIVERY_FAILED",
        },
      });
      result.failed += 1;
    }
  }
  return result;
}
