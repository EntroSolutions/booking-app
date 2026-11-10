// Zod schemas for every reservation API input.
//
// Rules:
// - Every timestamp is an ISO 8601 string with an explicit offset/Z; it is
//   normalized to UTC (`new Date(...).toISOString()`) before it reaches the
//   service, so downstream comparisons never depend on the client's zone.
// - Ids are opaque strings (Prisma cuid); we only enforce shape, not format.
// - Unknown keys are stripped, never trusted.
import { z } from "zod";

/** ISO 8601 instant → canonical UTC ISO string. */
export const instantSchema = z
  .string()
  .trim()
  .min(1, "Timestamp is required")
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Expected an ISO 8601 timestamp",
  })
  // Require the string to actually carry a zone/offset, otherwise the server
  // and client could disagree on what "2026-03-01T10:00" means.
  .refine((value) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value), {
    message: "Timestamp must include a UTC offset (e.g. 2026-03-01T10:00:00Z)",
  })
  .transform((value) => new Date(value).toISOString());

const idSchema = z.string().trim().min(1, "Id is required").max(64);

/**
 * A client-generated key that makes booking retries safe. Restrict to a
 * URL/UUID-friendly alphabet so it can also live in headers or query strings.
 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency key must be at least 8 characters")
  .max(128, "Idempotency key must be at most 128 characters")
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains invalid characters");

/**
 * GET /api/coaches/[coachId]/slots
 *
 * `from`/`to` bound the returned window so the client can page through the
 * horizon instead of materialising every slot for the next 30 days. Both are
 * optional for backwards compatibility; when present they form a half-open
 * [from, to) ISO instant range.
 */
export const listSlotsSchema = z.object({
  coachId: idSchema,
  from: instantSchema.optional(),
  to: instantSchema.optional(),
});

export type ListSlotsInput = z.infer<typeof listSlotsSchema>;

/** POST /api/reservations */
export const createReservationSchema = z.object({
  coachId: idSchema,
  startsAt: instantSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/** POST /api/reservations/[id]/cancel */
export const cancelReservationSchema = z.object({
  reservationId: idSchema,
  reason: z.string().trim().max(500).optional(),
  /**
   * Optional, echoed back in the response. Sending the same key twice makes
   * the second call a no-op success instead of an error.
   */
  idempotencyKey: idempotencyKeySchema.optional(),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

/** GET /api/reservations */
export const listReservationsSchema = z.object({
  /** Defaults to the caller's own reservations. */
  scope: z.enum(["mine", "coach"]).default("mine"),
  /** Optional coach filter for clients who booked several coaches. */
  coachId: idSchema.optional(),
  /** Include reservations whose slot already ended. Defaults to false. */
  includePast: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(false)
    .transform((value) => value === true || value === "true"),
  /** Filter by lifecycle status. Repeating the param is allowed. */
  status: z
    .array(
      z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]),
    )
    .optional(),
  /** Maximum rows to return (1..100). */
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListReservationsInput = z.infer<typeof listReservationsSchema>;

/**
 * Convert a `URLSearchParams` into a plain object with `status` collected as
 * an array, ready for `listReservationsSchema`.
 */
export function reservationListParams(
  params: URLSearchParams,
): Record<string, unknown> {
  const status = params.getAll("status").filter(Boolean);
  const raw: Record<string, unknown> = {};
  for (const key of ["scope", "coachId", "includePast", "limit"]) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  if (status.length > 0) raw.status = status;
  return raw;
}
