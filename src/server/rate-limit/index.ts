import { createHash } from "node:crypto";
import { HttpError } from "@/server/http/errors";
import {
  createUpstashRateLimitStore,
  memoryRateLimitStore,
  type RateLimitStore,
} from "./store";

export const RATE_LIMIT_POLICIES = {
  auth: { limit: 5, windowMs: 15 * 60_000 },
  slots: { limit: 60, windowMs: 60_000 },
  booking: { limit: 10, windowMs: 60_000 },
  cancellation: { limit: 10, windowMs: 60_000 },
  reservations: { limit: 60, windowMs: 60_000 },
  emailJob: { limit: 30, windowMs: 60_000 },
  availability: { limit: 20, windowMs: 60_000 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_POLICIES;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAtSeconds: number;
}

function configuredStore(): RateLimitStore {
  const choice = process.env.RATE_LIMIT_STORE?.toLowerCase();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (choice === "upstash" || (url && token)) {
    if (!url || !token) {
      throw new HttpError(
        503,
        "SERVICE_UNAVAILABLE",
        "The service is temporarily unavailable.",
      );
    }
    return createUpstashRateLimitStore(url, token);
  }

  // Memory is the documented local fallback. Production must opt in explicitly
  // so a missing Redis variable cannot silently disable distributed limiting.
  if (
    choice === "memory" ||
    (process.env.NODE_ENV !== "production" && choice !== "upstash")
  ) {
    return memoryRateLimitStore;
  }

  throw new HttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "The service is temporarily unavailable.",
  );
}

function storageKey(bucket: RateLimitBucket, identifier: string): string {
  const secret =
    process.env.RATE_LIMIT_KEY_SECRET ??
    process.env.AUTH_SECRET ??
    "local-development-rate-limit-key";
  const digest = createHash("sha256")
    .update(secret)
    .update(":")
    .update(bucket)
    .update(":")
    .update(identifier)
    .digest("hex");
  return `booking:rl:v1:${bucket}:${digest}`;
}

export async function checkRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
  store: RateLimitStore = configuredStore(),
): Promise<RateLimitDecision> {
  const policy = RATE_LIMIT_POLICIES[bucket];
  try {
    const { count, ttlMs } = await store.increment(
      storageKey(bucket, identifier),
      policy.windowMs,
    );
    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
      resetAtSeconds: Math.ceil((Date.now() + ttlMs) / 1_000),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "The service is temporarily unavailable.",
    );
  }
}

export async function enforceRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitDecision> {
  const decision = await checkRateLimit(bucket, identifier);
  if (!decision.allowed) {
    throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again later.", {
      "Retry-After": String(decision.retryAfterSeconds),
      "RateLimit-Limit": String(decision.limit),
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": String(decision.resetAtSeconds),
    });
  }
  return decision;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "local").slice(0, 128);
}

export function rateLimitHeaders(
  decision: RateLimitDecision,
): Record<string, string> {
  return {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(decision.resetAtSeconds),
  };
}
