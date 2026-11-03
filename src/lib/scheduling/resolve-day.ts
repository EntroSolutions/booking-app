import { mergeIntervals, subtractAll } from "./intervals";
import { parseLocalDate, weekdayForLocalDate } from "./timezone";
import type {
  AvailabilityExceptionInput,
  MinuteInterval,
  Weekday,
  WeeklyAvailabilityInput,
} from "./types";

function weeklyForWeekday(
  weekly: WeeklyAvailabilityInput[],
  weekday: Weekday,
): MinuteInterval[] {
  return mergeIntervals(
    weekly
      .filter((w) => w.weekday === weekday)
      .map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute })),
  );
}

function exceptionsForDate(
  exceptions: AvailabilityExceptionInput[],
  dateKey: string,
): AvailabilityExceptionInput[] {
  return exceptions.filter((e) => e.date === dateKey);
}

/**
 * Resolve the final allowed minute intervals for one local calendar day:
 * start from weekly rules, apply date-specific closures / overrides, merge.
 */
export function resolveDayIntervals(
  dateKey: string,
  timezone: string,
  weekly: WeeklyAvailabilityInput[],
  exceptions: AvailabilityExceptionInput[],
): MinuteInterval[] {
  const localDay = parseLocalDate(dateKey, timezone);
  const weekday = weekdayForLocalDate(localDay);
  let allowed = weeklyForWeekday(weekly, weekday);
  const dayExceptions = exceptionsForDate(exceptions, dateKey);

  // Full-day closures wipe everything first.
  if (dayExceptions.some((e) => e.isUnavailable && e.startMinute == null)) {
    allowed = [];
  }

  const blocks: MinuteInterval[] = [];
  const extras: MinuteInterval[] = [];

  for (const ex of dayExceptions) {
    if (ex.startMinute == null || ex.endMinute == null) continue;
    const window = { startMinute: ex.startMinute, endMinute: ex.endMinute };
    if (ex.isUnavailable) blocks.push(window);
    else extras.push(window);
  }

  if (blocks.length > 0) allowed = subtractAll(allowed, blocks);
  if (extras.length > 0) allowed = mergeIntervals([...allowed, ...extras]);
  return allowed;
}
