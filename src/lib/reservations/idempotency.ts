// Framework-independent booking rules shared by the service and the APIs:
// idempotency key derivation, request fingerprints and PostgreSQL error
// classification. Pure functions only, so they are easy to unit test.
import { createHash } from "node:crypto";
import type { ReservationErrorCode } from "./errors";

/**
 * Scope an idempotency key to an operation namespace so the same client key
 * can never collide between booking and cancellation, or across users.
 */
export function scopedIdempotencyKey(
  namespace: "book" | "cancel",
  userId: string,
  key: string,
): string {
  return `${namespace}:${userId}:${key.trim()}`;
}

/**
 * Deterministic fingerprint of a request payload. Used to detect an
 * idempotency key being replayed with *different* content, which must fail
 * rather than silently return an unrelated reservation.
 */
export function requestFingerprint(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((key) => [key, payload[key]]),
  );
  return createHash("sha256").update(normalized).digest("hex");
}

interface PostgresErrorShape {
  code?: unknown;
  meta?: { code?: unknown; message?: unknown; constraint?: unknown };
  constraint?: unknown;
  message?: unknown;
}

/** Normalize Prisma's several shapes for raw Postgres errors. */
function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const shape = error as PostgresErrorShape;
  const candidates = [shape.code, shape.meta?.code];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^[0-9A-Z]{5}$/.test(candidate)) {
      return candidate;
    }
  }
  // Prisma sometimes only exposes the text form: "Raw query failed. Code: `23P01`."
  const message = typeof shape.message === "string" ? shape.message : "";
  const fromMessage = message.match(/Code: `([0-9A-Z]{5})`/);
  return fromMessage?.[1];
}

/** `23P01` — exclusion_violation: the coach already has an overlapping booking. */
export function isExclusionViolation(error: unknown): boolean {
  return postgresCode(error) === "23P01";
}

/** `23505` — unique_violation, e.g. a replayed idempotency key. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

/**
 * Map a thrown persistence error to a stable domain code. Returns null when
 * the error is not a recognizable database conflict (caller rethrows).
 */
export function conflictCodeFromDatabaseError(
  error: unknown,
): Extract<ReservationErrorCode, "SLOT_TAKEN" | "IDEMPOTENCY_KEY_REUSED"> | null {
  if (isExclusionViolation(error)) return "SLOT_TAKEN";
  if (isUniqueViolation(error)) return "IDEMPOTENCY_KEY_REUSED";
  return null;
}
