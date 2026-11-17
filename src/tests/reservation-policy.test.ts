// Unit tests for the booking policy and idempotency helpers. These are pure
// functions, so all rules (lead time, horizon, cancellation cutoff, key
// scoping, database error classification) can be verified without a database.
import { afterEach, describe, expect, it } from "vitest";
import {
  cancellationDeadline,
  earliestStartMs,
  horizonEndMs,
  isCancellationAllowed,
  localDayWindowUtc,
  parseBookingPolicy,
  policyFromEnv,
  DEFAULT_BOOKING_POLICY,
} from "@/lib/reservations/policy";
import {
  conflictCodeFromDatabaseError,
  isExclusionViolation,
  isUniqueViolation,
  requestFingerprint,
  scopedIdempotencyKey,
} from "@/lib/reservations/idempotency";

afterEach(() => {
  delete process.env.BOOKING_SESSION_MINUTES;
  delete process.env.BOOKING_LEAD_TIME_MINUTES;
  delete process.env.BOOKING_HORIZON_DAYS;
  delete process.env.BOOKING_CANCELLATION_CUTOFF_MINUTES;
  delete process.env.BOOKING_IDEMPOTENCY_TTL_HOURS;
});

describe("parseBookingPolicy", () => {
  it("returns the defaults for an empty input", () => {
    expect(parseBookingPolicy()).toEqual(DEFAULT_BOOKING_POLICY);
  });

  it("rejects non-positive session durations", () => {
    expect(() =>
      parseBookingPolicy({ sessionDurationMinutes: 0 }),
    ).toThrow();
  });

  it("rejects a negative cancellation cutoff", () => {
    expect(() =>
      parseBookingPolicy({ cancellationCutoffMinutes: -1 }),
    ).toThrow();
  });
});

describe("policyFromEnv", () => {
  it("reads overrides from environment variables", () => {
    process.env.BOOKING_SESSION_MINUTES = "90";
    process.env.BOOKING_LEAD_TIME_MINUTES = "30";
    const policy = policyFromEnv();
    expect(policy.sessionDurationMinutes).toBe(90);
    expect(policy.leadTimeMinutes).toBe(30);
    expect(policy.bookingHorizonDays).toBe(DEFAULT_BOOKING_POLICY.bookingHorizonDays);
  });

  it("falls back to defaults for empty or non-numeric values", () => {
    process.env.BOOKING_SESSION_MINUTES = "  ";
    process.env.BOOKING_LEAD_TIME_MINUTES = "abc";
    const policy = policyFromEnv();
    expect(policy.sessionDurationMinutes).toBe(
      DEFAULT_BOOKING_POLICY.sessionDurationMinutes,
    );
    expect(policy.leadTimeMinutes).toBe(DEFAULT_BOOKING_POLICY.leadTimeMinutes);
  });

  it("throws a domain error for out-of-range env values", () => {
    process.env.BOOKING_SESSION_MINUTES = "2000"; // max is 24*60
    expect(() => policyFromEnv()).toThrow();
  });
});

describe("cancellation cutoff", () => {
  const start = "2026-06-01T09:00:00.000Z";

  it("allows cancellation before the cutoff and blocks after", () => {
    // 24h cutoff: allowed up to 2026-05-31T09:00Z
    expect(
      isCancellationAllowed(start, "2026-05-31T08:59:59.000Z", 24 * 60),
    ).toBe(true);
    expect(
      isCancellationAllowed(start, "2026-05-31T09:00:01.000Z", 24 * 60),
    ).toBe(false);
  });

  it("treats the deadline instant itself as still allowed", () => {
    expect(isCancellationAllowed(start, "2026-05-31T09:00:00.000Z", 24 * 60)).toBe(
      true,
    );
  });

  it("accepts Date inputs and reports the deadline", () => {
    expect(
      isCancellationAllowed(new Date(start), new Date("2026-06-01T00:00:00.000Z"), 60),
    ).toBe(true);
    expect(cancellationDeadline(start, 60).toISOString()).toBe(
      "2026-06-01T08:00:00.000Z",
    );
  });

  it("is unaffected by time zones (absolute instants)", () => {
    expect(
      isCancellationAllowed(start, "2026-05-31T09:00:01.000+02:00", 24 * 60),
    ).toBe(true); // equals 07:00:01Z, well before the deadline
  });
});

describe("horizon and lead time", () => {
  it("bounds slots by the local booking horizon", () => {
    const end = horizonEndMs("2026-06-01T23:00:00.000Z", "UTC", 30);
    // local midnight + 30 days = 2026-07-01T00:00Z
    expect(end).toBe(Date.parse("2026-07-01T00:00:00.000Z"));
  });

  it("computes the earliest bookable start from the lead time", () => {
    expect(earliestStartMs("2026-06-01T09:00:00.000Z", 60)).toBe(
      Date.parse("2026-06-01T10:00:00.000Z"),
    );
  });

  it("resolves a UTC window covering local days in a shifted zone", () => {
    const { startMs, endMs } = localDayWindowUtc(
      "Asia/Tokyo",
      "2026-06-01",
      "2026-06-02",
    );
    expect(startMs).toBe(Date.parse("2026-05-31T15:00:00.000Z"));
    expect(endMs).toBe(Date.parse("2026-06-02T15:00:00.000Z"));
    expect(endMs).toBeGreaterThan(startMs);
  });

  it("rejects unresolvable local dates", () => {
    expect(() => localDayWindowUtc("UTC", "not-a-date", "2026-06-02")).toThrow();
  });
});

describe("idempotency keys", () => {
  it("scopes keys to the operation and user", () => {
    expect(scopedIdempotencyKey("book", "user_1", " abc ")).toBe(
      "book:user_1:abc",
    );
    expect(scopedIdempotencyKey("cancel", "user_1", "abc")).toBe(
      "cancel:user_1:abc",
    );
    expect(scopedIdempotencyKey("book", "user_2", "abc")).not.toBe(
      scopedIdempotencyKey("book", "user_1", "abc"),
    );
  });

  it("produces a stable fingerprint independent of key order", () => {
    expect(requestFingerprint({ a: 1, b: 2 })).toBe(
      requestFingerprint({ b: 2, a: 1 }),
    );
  });

  it("changes when the payload changes", () => {
    expect(requestFingerprint({ a: 1 })).not.toBe(requestFingerprint({ a: 2 }));
  });
});

describe("database error classification", () => {
  it("detects exclusion (overlap) violations in Prisma and raw shapes", () => {
    expect(isExclusionViolation({ code: "23P01" })).toBe(true);
    expect(isExclusionViolation({ meta: { code: "23P01" } })).toBe(true);
    expect(
      isExclusionViolation({
        meta: { message: 'error with code `23P01` in message' },
      }),
    ).toBe(true);
    expect(isExclusionViolation({ code: "23505" })).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
  });

  it("detects unique violations including Prisma P2002", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23P01" })).toBe(false);
  });

  it("maps conflicts to reservation error codes", () => {
    expect(conflictCodeFromDatabaseError({ code: "23P01" })).toBe("SLOT_TAKEN");
    expect(conflictCodeFromDatabaseError({ code: "P2002" })).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
    expect(conflictCodeFromDatabaseError(new Error("boom"))).toBeNull();
  });
});
