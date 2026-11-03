// Booking policy: tunable rules that apply to every booking request.
//
// All values are integers measured in minutes (or days). They are read from
// the environment with safe defaults so the service stays deterministic in
// tests and predictable in production. Instantiate with `parseBookingPolicy`
// or provide explicit values (recommended in tests).
import { z } from "zod";
import { SchedulingError } from "@/lib/scheduling";
import { localMinutesToUtc, toDateTime } from "@/lib/scheduling/timezone";

export interface BookingPolicy {
  /** Length of a single session in minutes. */
  sessionDurationMinutes: number;
  /** Minimum minutes between `now` and a bookable slot start. */
  leadTimeMinutes: number;
  /** How many local calendar days ahead of today slots may be booked. */
  bookingHorizonDays: number;
  /**
   * How long before the session start a client may still cancel without
   * penalty. 0 means "anytime before the start"; a negative value is invalid.
   */
  cancellationCutoffMinutes: number;
  /** How long a recorded idempotency key is honoured. */
  idempotencyTtlHours: number;
}

/** Defaults chosen for a typical 1:1 coaching practice. */
export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  sessionDurationMinutes: 60,
  leadTimeMinutes: 60,
  bookingHorizonDays: 30,
  cancellationCutoffMinutes: 24 * 60,
  idempotencyTtlHours: 24,
};

const intFromEnv = (raw: string | undefined, fallback: number) => {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const policySchema = z.object({
  sessionDurationMinutes: z.number().int().positive().max(24 * 60),
  leadTimeMinutes: z.number().int().nonnegative().max(7 * 24 * 60),
  bookingHorizonDays: z.number().int().positive().max(365),
  cancellationCutoffMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(30 * 24 * 60),
  idempotencyTtlHours: z.number().int().positive().max(24 * 90),
});

/**
 * Validate booking policy values. Throws `SchedulingError` so callers can map
 * misconfiguration to the same domain-error path as invalid input.
 */
export function parseBookingPolicy(
  input: Partial<BookingPolicy> = {},
): BookingPolicy {
  const merged = { ...DEFAULT_BOOKING_POLICY, ...input };
  const parsed = policySchema.safeParse(merged);
  if (!parsed.success) {
    throw new SchedulingError(
      `Invalid booking policy: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Read the policy from `BOOKING_*` environment variables. */
export function policyFromEnv(
  env: Record<string, string | undefined> = process.env,
): BookingPolicy {
  return parseBookingPolicy({
    sessionDurationMinutes: intFromEnv(
      env.BOOKING_SESSION_MINUTES,
      DEFAULT_BOOKING_POLICY.sessionDurationMinutes,
    ),
    leadTimeMinutes: intFromEnv(
      env.BOOKING_LEAD_TIME_MINUTES,
      DEFAULT_BOOKING_POLICY.leadTimeMinutes,
    ),
    bookingHorizonDays: intFromEnv(
      env.BOOKING_HORIZON_DAYS,
      DEFAULT_BOOKING_POLICY.bookingHorizonDays,
    ),
    cancellationCutoffMinutes: intFromEnv(
      env.BOOKING_CANCELLATION_CUTOFF_MINUTES,
      DEFAULT_BOOKING_POLICY.cancellationCutoffMinutes,
    ),
    idempotencyTtlHours: intFromEnv(
      env.BOOKING_IDEMPOTENCY_TTL_HOURS,
      DEFAULT_BOOKING_POLICY.idempotencyTtlHours,
    ),
  });
}

/**
 * Whether a session starting at `startsAt` may still be cancelled at `now`.
 *
 * The cutoff is measured from the session start; because the comparison is
 * done on absolute instants it is unaffected by DST or the coach's zone.
 */
export function isCancellationAllowed(
  startsAt: string | Date,
  now: string | Date,
  cutoffMinutes: number,
): boolean {
  const startMs = toDateTime(startsAt).toMillis();
  const nowMs = toDateTime(now).toMillis();
  const deadlineMs = startMs - cutoffMinutes * 60 * 1000;
  return nowMs <= deadlineMs;
}

/**
 * The instant at which cancellation stops being allowed (for messaging).
 */
export function cancellationDeadline(
  startsAt: string | Date,
  cutoffMinutes: number,
): Date {
  return new Date(
    toDateTime(startsAt).toMillis() - cutoffMinutes * 60 * 1000,
  );
}

/** Start of the booking horizon, compared against slot starts (UTC ms). */
export function horizonEndMs(
  now: string | Date,
  timezone: string,
  bookingHorizonDays: number,
): number {
  const localNow = toDateTime(now).setZone(timezone);
  return localNow
    .startOf("day")
    .plus({ days: bookingHorizonDays })
    .toUTC()
    .toMillis();
}

/** Earliest bookable slot start (UTC ms), given lead time. */
export function earliestStartMs(
  now: string | Date,
  leadTimeMinutes: number,
): number {
  return toDateTime(now).toMillis() + leadTimeMinutes * 60 * 1000;
}

/**
 * Resolve the local `YYYY-MM-DD` dates a coach's schedule could produce slots
 * for, so callers can fetch a single bounded window of reservations.
 * Returns UTC instants bounding the *local days* (not UTC days).
 */
export function localDayWindowUtc(
  timezone: string,
  fromLocalDate: string,
  toLocalDate: string,
): { startMs: number; endMs: number } {
  const start = localMinutesToUtc(fromLocalDate, 0, timezone);
  const end = localMinutesToUtc(toLocalDate, 1440, timezone);
  if (!start || !end) {
    throw new SchedulingError(
      `Cannot resolve local day window ${fromLocalDate}..${toLocalDate} in ${timezone}`,
    );
  }
  return { startMs: start.toMillis(), endMs: end.toMillis() };
}
