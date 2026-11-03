// Stable, transport-agnostic domain errors for the reservation service.
//
// Route handlers and server actions translate these into HTTP responses, so
// the UI can rely on `code` (a stable string) rather than parsing messages.

export const RESERVATION_ERROR_CODES = [
  /** Input failed schema validation (400). */
  "INVALID_INPUT",
  /** The caller must sign in (401). */
  "UNAUTHENTICATED",
  /** The caller may not perform this operation (403). */
  "FORBIDDEN",
  /** The coach does not exist or has no bookable profile (404). */
  "COACH_NOT_FOUND",
  /** The reservation does not exist (404). */
  "RESERVATION_NOT_FOUND",
  /** The requested slot is not produced by the coach's schedule (409). */
  "SLOT_UNAVAILABLE",
  /** The slot start is inside the lead time / past (409). */
  "LEAD_TIME_VIOLATION",
  /** The slot start is outside the booking horizon (409). */
  "HORIZON_EXCEEDED",
  /** Another active reservation holds the slot (409). */
  "SLOT_TAKEN",
  /** The idempotency key was reused with a different request payload (409). */
  "IDEMPOTENCY_KEY_REUSED",
  /** The reservation can no longer be cancelled (409). */
  "CANCELLATION_WINDOW_PASSED",
  /** The reservation is already cancelled (idempotent success path is separate) (409). */
  "ALREADY_CANCELLED",
  /** The reservation status cannot transition to cancelled (409). */
  "INVALID_STATUS_TRANSITION",
  /** Unexpected persistence failure (500). */
  "INTERNAL_ERROR",
] as const;

export type ReservationErrorCode = (typeof RESERVATION_ERROR_CODES)[number];

/** HTTP status associated with each domain code. */
const STATUS_BY_CODE: Record<ReservationErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  COACH_NOT_FOUND: 404,
  RESERVATION_NOT_FOUND: 404,
  SLOT_UNAVAILABLE: 409,
  LEAD_TIME_VIOLATION: 409,
  HORIZON_EXCEEDED: 409,
  SLOT_TAKEN: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  CANCELLATION_WINDOW_PASSED: 409,
  ALREADY_CANCELLED: 409,
  INVALID_STATUS_TRANSITION: 409,
  INTERNAL_ERROR: 500,
};

export interface ReservationErrorOptions {
  /** Safe message for the end user; never includes internal details. */
  message: string;
  /** Field-level validation details (only for INVALID_INPUT). */
  details?: Array<{ path: string; message: string }>;
  /** Underlying error, kept for logging but never serialized. */
  cause?: unknown;
}

export class ReservationError extends Error {
  readonly code: ReservationErrorCode;
  readonly status: number;
  readonly details?: Array<{ path: string; message: string }>;

  constructor(code: ReservationErrorCode, options: ReservationErrorOptions) {
    super(options.message);
    this.name = "ReservationError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** Conflict-style errors that a client may retry after refreshing slots. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** Wire shape returned to clients; stable across route handlers/actions. */
export interface ReservationErrorBody {
  error: {
    code: ReservationErrorCode;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export function isReservationError(
  error: unknown,
): error is ReservationError {
  return error instanceof ReservationError;
}

export function toErrorBody(error: ReservationError): ReservationErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

/** User-facing copy for the common conflicts (kept here so APIs agree). */
export const RESERVATION_ERROR_MESSAGES: Partial<
  Record<ReservationErrorCode, string>
> = {
  SLOT_UNAVAILABLE:
    "That time is no longer offered by the coach. Please pick another slot.",
  SLOT_TAKEN: "That time was just booked by someone else. Please pick another.",
  LEAD_TIME_VIOLATION: "That time is too soon to book.",
  HORIZON_EXCEEDED: "That time is too far in the future to book.",
  IDEMPOTENCY_KEY_REUSED:
    "This request key was already used for a different booking.",
  CANCELLATION_WINDOW_PASSED:
    "This session can no longer be cancelled online. Please contact your coach.",
  ALREADY_CANCELLED: "This reservation is already cancelled.",
  INVALID_STATUS_TRANSITION: "This reservation can no longer be cancelled.",
  RESERVATION_NOT_FOUND: "Reservation not found.",
  COACH_NOT_FOUND: "Coach not found.",
  FORBIDDEN: "You do not have access to this reservation.",
  UNAUTHENTICATED: "Please sign in to continue.",
};
