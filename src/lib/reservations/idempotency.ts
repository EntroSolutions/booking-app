// Framework-independent booking rules shared by the service and the APIs:
// idempotency key derivation, request fingerprints and PostgreSQL error
// classification. Pure functions only, so they are easy to unit test.
import { createHash } from "node:crypto";
import type { ReservationErrorCode } from "./errors";

/** Scope a key to an operation and user to prevent cross-operation replays. */
export function scopedIdempotencyKey(
  namespace: "book" | "cancel",
  userId: string,
  key: string,
): string {
  return `${namespace}:${userId}:${key.trim()}`;
}

/** Deterministic request fingerprint used to reject changed replays. */
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
  const message = typeof shape.message === "string" ? shape.message : "";
  return message.match(/Code: `([0-9A-Z]{5})`/)?.[1];
}

/** `23P01` — an active reservation overlaps the requested session. */
export function isExclusionViolation(error: unknown): boolean {
  return postgresCode(error) === "23P01";
}

/** Prisma P2002 or Postgres 23505 unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as PostgresErrorShape).code;
    if (code === "P2002") return true;
  }
  return postgresCode(error) === "23505";
}

/** Map recognized database conflicts; unknown failures are rethrown. */
export function conflictCodeFromDatabaseError(
  error: unknown,
): Extract<
  ReservationErrorCode,
  "SLOT_TAKEN" | "IDEMPOTENCY_KEY_REUSED"
> | null {
  if (isExclusionViolation(error)) return "SLOT_TAKEN";
  if (isUniqueViolation(error)) return "IDEMPOTENCY_KEY_REUSED";
  return null;
}
