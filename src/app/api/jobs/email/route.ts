import { timingSafeEqual } from "node:crypto";
import { HttpError } from "@/server/http/errors";
import { jsonResponse, observedRoute } from "@/server/http/route";
import {
  clientIp,
  enforceRateLimit,
  rateLimitHeaders,
} from "@/server/rate-limit";
import { processEmailOutbox } from "@/server/email/process-outbox";
import { assertEmailDeliveryConfigured } from "@/server/email/deliver";

function authorized(header: string | null): boolean {
  const expected = process.env.EMAIL_JOB_SECRET;
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/** Invoke from a scheduler using a bearer secret; never expose this to browsers. */
export const POST = observedRoute("jobs.email", async (request) => {
  const decision = await enforceRateLimit("emailJob", clientIp(request.headers));
  if (!authorized(request.headers.get("authorization"))) {
    throw new HttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  assertEmailDeliveryConfigured();
  const result = await processEmailOutbox();
  return jsonResponse(result, 200, rateLimitHeaders(decision));
});
