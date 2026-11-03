/**
 * Strongly typed inputs/outputs for the scheduling engine.
 * Browser-facing timestamps are always ISO 8601 UTC strings.
 */

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Half-open wall-clock interval in minutes from local midnight: [start, end). */
export interface MinuteInterval {
  startMinute: number;
  endMinute: number;
}

export interface WeeklyAvailabilityInput extends MinuteInterval {
  weekday: Weekday;
}

/**
 * Date-specific override for a local calendar day (coach time zone).
 * - isUnavailable + null minutes → closed all day
 * - isUnavailable + window → subtract that window from availability
 * - !isUnavailable + window → add/union that window (extra availability)
 */
export interface AvailabilityExceptionInput {
  /** Local calendar date as YYYY-MM-DD */
  date: string;
  isUnavailable: boolean;
  startMinute?: number | null;
  endMinute?: number | null;
}

export type ActiveReservationStatus = "PENDING" | "CONFIRMED";

export interface ReservationInput {
  /** Absolute instant (ISO 8601 or Date); compared in UTC. */
  startsAt: string | Date;
  endsAt: string | Date;
  status: ActiveReservationStatus | "CANCELLED" | "COMPLETED";
}

export interface GenerateSlotsInput {
  /** IANA time zone, e.g. "Europe/Berlin". */
  timezone: string;
  weeklyAvailability: WeeklyAvailabilityInput[];
  exceptions?: AvailabilityExceptionInput[];
  reservations?: ReservationInput[];
  /** Session length in minutes; slots are contiguous non-overlapping. */
  sessionDurationMinutes: number;
  /** Minimum minutes between `now` and a bookable slot start. */
  leadTimeMinutes: number;
  /** How many local calendar days ahead of `now` to search (inclusive of today). */
  bookingHorizonDays: number;
  /** Reference instant for lead time / horizon. Defaults to current time. */
  now?: string | Date;
}

export interface BookableSlot {
  /** Slot start as ISO 8601 UTC. */
  startsAt: string;
  /** Slot end as ISO 8601 UTC. */
  endsAt: string;
}

export class SchedulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingError";
  }
}
