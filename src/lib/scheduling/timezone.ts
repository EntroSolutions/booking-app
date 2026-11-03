import { DateTime, IANAZone } from "luxon";
import { SchedulingError, WEEKDAYS, type Weekday } from "./types";

/** Luxon weekday: 1=Mon … 7=Sun → our Weekday enum. */
const LUXON_TO_WEEKDAY: Record<number, Weekday> = {
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
  7: "SUNDAY",
};

export function assertValidTimezone(timezone: string): void {
  if (!IANAZone.isValidZone(timezone)) {
    throw new SchedulingError(`Invalid IANA time zone: ${timezone}`);
  }
}

export function toDateTime(value: string | Date, zone = "utc"): DateTime {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone })
      : DateTime.fromISO(value, { zone });
  if (!dt.isValid) {
    throw new SchedulingError(`Invalid timestamp: ${String(value)}`);
  }
  return dt;
}

export function weekdayForLocalDate(localDate: DateTime): Weekday {
  const weekday = LUXON_TO_WEEKDAY[localDate.weekday];
  if (!weekday || !WEEKDAYS.includes(weekday)) {
    throw new SchedulingError(`Unexpected weekday for ${localDate.toISODate()}`);
  }
  return weekday;
}

/** Local calendar date string YYYY-MM-DD in the given zone. */
export function localDateKey(dt: DateTime, timezone: string): string {
  const key = dt.setZone(timezone).toISODate();
  if (!key) throw new SchedulingError("Failed to format local date");
  return key;
}

/** Prefer the earlier UTC instant when a local wall time repeats (fall-back). */
function preferEarlierFold(
  dt: DateTime,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): DateTime {
  const earlier = DateTime.fromMillis(dt.toMillis() - 60 * 60 * 1000, {
    zone: timezone,
  });
  if (
    earlier.year === year &&
    earlier.month === month &&
    earlier.day === day &&
    earlier.hour === hour &&
    earlier.minute === minute
  ) {
    return earlier;
  }
  return dt;
}

/**
 * Resolve a local wall-clock minute on a calendar day to a UTC instant.
 * Returns null for DST spring-forward gaps. On fall-back folds, uses the
 * earlier occurrence so results stay deterministic.
 */
export function localMinutesToUtc(
  localDateIso: string,
  minuteOfDay: number,
  timezone: string,
): DateTime | null {
  const [year, month, day] = localDateIso.split("-").map(Number);
  const base = DateTime.fromObject(
    { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    { zone: timezone },
  );
  if (!base.isValid) return null;

  // 1440 = exclusive midnight at the start of the next local day.
  if (minuteOfDay === 1440) return base.plus({ days: 1 }).toUTC();

  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: timezone },
  );
  // Gap: Luxon jumps forward so the wall clock no longer matches.
  if (!dt.isValid || dt.hour !== hour || dt.minute !== minute) return null;

  return preferEarlierFold(dt, year, month, day, hour, minute, timezone).toUTC();
}

/** Inclusive list of local YYYY-MM-DD keys from start..end in coach zone. */
export function eachLocalDate(
  fromLocal: DateTime,
  toLocal: DateTime,
): string[] {
  const dates: string[] = [];
  let cursor = fromLocal.startOf("day");
  const last = toLocal.startOf("day");
  while (cursor <= last) {
    const key = cursor.toISODate();
    if (key) dates.push(key);
    cursor = cursor.plus({ days: 1 });
  }
  return dates;
}

export function parseLocalDate(dateIso: string, timezone: string): DateTime {
  const dt = DateTime.fromISO(dateIso, { zone: timezone });
  if (!dt.isValid || dateIso.length < 10) {
    throw new SchedulingError(`Invalid local date: ${dateIso}`);
  }
  return dt.startOf("day");
}
