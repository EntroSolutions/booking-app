// Persistence port for the reservation service.
//
// The service depends only on this narrow interface, so the booking rules can
// be exercised in unit tests against an in-memory implementation while
// production wires up Prisma (see `prisma-reservation-repository.ts`).
//
// The important contract: `createWithinTx` runs inside a transaction whose
// insert is guarded by the PostgreSQL exclusion constraint
// `reservation_no_overlap`. Implementations must let the driver error
// (`23P01` exclusion_violation) propagate so the service can translate it into
// a stable `SLOT_TAKEN` conflict.

export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED";

/** Statuses that occupy a slot and participate in the exclusion constraint. */
export const ACTIVE_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
] as const satisfies readonly ReservationStatus[];

export type ActiveReservationStatus =
  (typeof ACTIVE_RESERVATION_STATUSES)[number];

export interface ReservationRecord {
  id: string;
  coachId: string;
  clientId: string;
  /** Absolute instant. Always serialized as an ISO 8601 UTC string. */
  startsAt: string;
  /** Absolute instant. Always serialized as an ISO 8601 UTC string. */
  endsAt: string;
  status: ReservationStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachScheduleRecord {
  coachId: string;
  timezone: string;
  weeklyAvailability: Array<{
    weekday:
      | "MONDAY"
      | "TUESDAY"
      | "WEDNESDAY"
      | "THURSDAY"
      | "FRIDAY"
      | "SATURDAY"
      | "SUNDAY";
    startMinute: number;
    endMinute: number;
  }>;
  exceptions: Array<{
    /** Local calendar date `YYYY-MM-DD` in the coach's time zone. */
    date: string;
    isUnavailable: boolean;
    startMinute: number | null;
    endMinute: number | null;
  }>;
}

export interface ReservationListFilter {
  coachId?: string;
  /** Only reservations starting at or before this instant. */
  startsBefore?: string;
  /** Only reservations ending at or after this instant. */
  endsAfter?: string;
  includePast: boolean;
  now: string;
  statuses?: ReservationStatus[];
  limit: number;
}

export interface ReservationRepository {
  /** Coach profile, weekly availability and exceptions (null if unknown). */
  findCoachSchedule(coachId: string): Promise<CoachScheduleRecord | null>;

  /** Active reservations for a coach overlapping [fromMs, toMs). */
  listActiveForCoach(
    coachId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ReservationRecord[]>;

  /** Active reservations for a client in the same window (slot preview). */
  listActiveForClient(
    clientId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ReservationRecord[]>;

  findById(reservationId: string): Promise<ReservationRecord | null>;

  /**
   * Look up a reservation previously created under `idempotencyKey`.
   * Returns null when the key was never used (or its record expired).
   */
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<{ reservation: ReservationRecord; fingerprint: string } | null>;

  /**
   * Atomically insert a reservation and record its idempotency key.
   *
   * Must run in a single database transaction. If the coach already has an
   * overlapping active reservation the driver raises `23P01`; if the
   * idempotency key was inserted concurrently `23505` is raised. Both are
   * expected and translated by the service.
   */
  createWithinTx(input: {
    coachId: string;
    clientId: string;
    startsAt: string;
    endsAt: string;
    status: ActiveReservationStatus;
    idempotencyKey: string | null;
    idempotencyFingerprint: string | null;
    idempotencyExpiresAt: string | null;
  }): Promise<ReservationRecord>;

  /**
   * Atomically transition an active reservation to CANCELLED. Returns the
   * updated record, or null when the row was not active anymore (another
   * request cancelled it first) so callers can treat that as a safe no-op.
   */
  cancelIfActive(input: {
    reservationId: string;
    cancelledAt: string;
    cancelReason: string | null;
  }): Promise<ReservationRecord | null>;

  /** Reservation lists for "my bookings" (client) or a coach's agenda. */
  list(filter: ReservationListFilter): Promise<ReservationRecord[]>;

  /**
   * Record the outcome of an idempotent cancellation so a retry returns the
   * same response instead of a 409.
   */
  rememberIdempotentResult(input: {
    idempotencyKey: string;
    reservationId: string;
    fingerprint: string;
    expiresAt: string;
  }): Promise<void>;

  findIdempotentResult(
    idempotencyKey: string,
  ): Promise<{ reservationId: string; fingerprint: string } | null>;
}
