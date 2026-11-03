import { sliceSlots } from "./intervals";
import { resolveDayIntervals } from "./resolve-day";
import {
  eachLocalDate,
  localDateKey,
  localMinutesToUtc,
  toDateTime,
} from "./timezone";
import type {
  BookableSlot,
  GenerateSlotsInput,
  MinuteInterval,
  ReservationInput,
} from "./types";
import { validateGenerateSlotsInput } from "./validate";

const ACTIVE = new Set(["PENDING", "CONFIRMED"]);

function activeBusyRanges(
  reservations: ReservationInput[],
): Array<{ startMs: number; endMs: number }> {
  return reservations
    .filter((r) => ACTIVE.has(r.status))
    .map((r) => ({
      startMs: toDateTime(r.startsAt).toMillis(),
      endMs: toDateTime(r.endsAt).toMillis(),
    }))
    .filter((r) => r.startMs < r.endMs);
}

function overlapsBusy(
  startMs: number,
  endMs: number,
  busy: Array<{ startMs: number; endMs: number }>,
): boolean {
  return busy.some((b) => startMs < b.endMs && endMs > b.startMs);
}

function emitUtcSlot(
  dateKey: string,
  slot: MinuteInterval,
  timezone: string,
): BookableSlot | null {
  const start = localMinutesToUtc(dateKey, slot.startMinute, timezone);
  // Gap: local start does not exist (spring-forward).
  if (!start) return null;

  const duration = slot.endMinute - slot.startMinute;
  const end = start.plus({ minutes: duration });

  // Ensure the session's local end wall-clock still maps inside the slice
  // (rejects slots whose wall-clock end lands in a DST gap when checked).
  const endWall = localMinutesToUtc(dateKey, slot.endMinute, timezone);
  if (!endWall) return null;

  return { startsAt: start.toISO()!, endsAt: end.toISO()! };
}

function slotsForDay(
  dateKey: string,
  input: GenerateSlotsInput,
  earliestMs: number,
  latestMs: number,
  busy: Array<{ startMs: number; endMs: number }>,
): BookableSlot[] {
  const intervals = resolveDayIntervals(
    dateKey,
    input.timezone,
    input.weeklyAvailability,
    input.exceptions ?? [],
  );
  const out: BookableSlot[] = [];

  for (const interval of intervals) {
    for (const piece of sliceSlots(interval, input.sessionDurationMinutes)) {
      const utc = emitUtcSlot(dateKey, piece, input.timezone);
      if (!utc) continue;
      const startMs = Date.parse(utc.startsAt);
      const endMs = Date.parse(utc.endsAt);
      if (startMs < earliestMs || startMs >= latestMs) continue;
      if (overlapsBusy(startMs, endMs, busy)) continue;
      out.push(utc);
    }
  }
  return out;
}

/**
 * Convert recurring weekly availability + date exceptions into bookable UTC
 * slots, respecting lead time, booking horizon, DST, and active reservations.
 */
export function generateSlots(input: GenerateSlotsInput): BookableSlot[] {
  validateGenerateSlotsInput(input);

  const now = toDateTime(input.now ?? new Date());
  const earliestMs = now.plus({ minutes: input.leadTimeMinutes }).toMillis();
  const localNow = now.setZone(input.timezone);
  const horizonEnd = localNow
    .startOf("day")
    .plus({ days: input.bookingHorizonDays });
  const latestMs = horizonEnd.toMillis();
  const dateKeys = eachLocalDate(localNow, horizonEnd.minus({ days: 1 }));
  const busy = activeBusyRanges(input.reservations ?? []);

  const slots: BookableSlot[] = [];
  for (const dateKey of dateKeys) {
    slots.push(...slotsForDay(dateKey, input, earliestMs, latestMs, busy));
  }

  // Deterministic order by start instant.
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return slots;
}

/** Convenience: local date of `now` in coach zone (for callers/tests). */
export function coachLocalDateToday(
  timezone: string,
  now: string | Date = new Date(),
): string {
  return localDateKey(toDateTime(now), timezone);
}
