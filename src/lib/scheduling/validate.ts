import { assertValidInterval } from "./intervals";
import { assertValidTimezone } from "./timezone";
import {
  SchedulingError,
  WEEKDAYS,
  type AvailabilityExceptionInput,
  type GenerateSlotsInput,
  type WeeklyAvailabilityInput,
} from "./types";

function validateWeekly(rows: WeeklyAvailabilityInput[]): void {
  for (const row of rows) {
    if (!WEEKDAYS.includes(row.weekday)) {
      throw new SchedulingError(`Unknown weekday: ${String(row.weekday)}`);
    }
    assertValidInterval(row, `weekly ${row.weekday}`);
  }
}

function validateException(ex: AvailabilityExceptionInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) {
    throw new SchedulingError(`Exception date must be YYYY-MM-DD: ${ex.date}`);
  }
  const hasStart = ex.startMinute != null;
  const hasEnd = ex.endMinute != null;
  if (hasStart !== hasEnd) {
    throw new SchedulingError(
      `Exception on ${ex.date}: startMinute and endMinute must both be set or both null`,
    );
  }
  if (!ex.isUnavailable && !hasStart) {
    throw new SchedulingError(
      `Exception on ${ex.date}: extra availability requires a minute window`,
    );
  }
  if (hasStart && hasEnd) {
    assertValidInterval(
      { startMinute: ex.startMinute!, endMinute: ex.endMinute! },
      `exception ${ex.date}`,
    );
  }
}

/** Validate all generateSlots inputs; throws SchedulingError on failure. */
export function validateGenerateSlotsInput(input: GenerateSlotsInput): void {
  assertValidTimezone(input.timezone);
  if (
    !Number.isInteger(input.sessionDurationMinutes) ||
    input.sessionDurationMinutes <= 0
  ) {
    throw new SchedulingError("sessionDurationMinutes must be a positive integer");
  }
  if (!Number.isInteger(input.leadTimeMinutes) || input.leadTimeMinutes < 0) {
    throw new SchedulingError("leadTimeMinutes must be a non-negative integer");
  }
  if (
    !Number.isInteger(input.bookingHorizonDays) ||
    input.bookingHorizonDays < 1
  ) {
    throw new SchedulingError("bookingHorizonDays must be an integer >= 1");
  }
  validateWeekly(input.weeklyAvailability);
  for (const ex of input.exceptions ?? []) validateException(ex);
}
