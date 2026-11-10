// Thin fetch wrappers for the booking APIs.
//
// Kept framework-free so component tests can stub `fetch` easily. Every
// function surfaces the stable server error `code` so the UI can distinguish
// "slot taken" (recoverable) from generic failures.

export interface SlotDto {
  startsAt: string;
  endsAt: string;
}

export interface ReservationDto {
  id: string;
  coachId: string;
  clientId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Error codes that mean "the slot is gone" and warrant a refresh. */
export const SLOT_CONFLICT_CODES = new Set([
  "SLOT_TAKEN",
  "SLOT_UNAVAILABLE",
  "LEAD_TIME_VIOLATION",
  "HORIZON_EXCEEDED",
]);

function extractError(status: number, body: unknown): ApiError {
  const error = (body as { error?: { code?: string; message?: string } })
    ?.error;
  return new ApiError(
    status,
    error?.code ?? "UNKNOWN",
    error?.message ?? "The request could not be completed.",
  );
}

/** Fetch a coach's slots for the half-open [from, to) window. */
export async function fetchSlots(
  coachId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<SlotDto[]> {
  const query = new URLSearchParams({ from, to });
  const response = await fetch(
    `/api/coaches/${encodeURIComponent(coachId)}/slots?${query.toString()}`,
    { cache: "no-store", signal },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw extractError(response.status, body);
  const slots = (body as { slots?: SlotDto[] })?.slots;
  if (!Array.isArray(slots)) {
    throw new ApiError(response.status, "UNKNOWN", "Unexpected response.");
  }
  return slots;
}

/**
 * Book a slot. `idempotencyKey` is sent both as the `Idempotency-Key` header
 * and in the body so either transport is honoured by the API.
 */
export async function bookSlot(input: {
  coachId: string;
  startsAt: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}): Promise<ReservationDto> {
  const response = await fetch("/api/reservations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      coachId: input.coachId,
      startsAt: input.startsAt,
      idempotencyKey: input.idempotencyKey,
    }),
    signal: input.signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw extractError(response.status, body);
  return body as ReservationDto;
}

/**
 * Sign-in URL that preserves the selected coach and slot through the Auth.js
 * magic-link redirect. The booking flow re-reads `slot` from the query after
 * sign-in so the user never has to pick the time twice.
 */
export function signInUrl(coachId: string, slotIso: string): string {
  const callback = `/coaches/${coachId}?slot=${encodeURIComponent(slotIso)}`;
  return `/sign-in?callbackUrl=${encodeURIComponent(callback)}`;
}
