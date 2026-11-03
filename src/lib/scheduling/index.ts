/**
 * Framework-independent scheduling engine.
 * Converts weekly local availability + exceptions into bookable UTC slots.
 */

export { generateSlots, coachLocalDateToday } from "./generate-slots";
export {
  assertValidInterval,
  mergeIntervals,
  subtractInterval,
  subtractAll,
  sliceSlots,
} from "./intervals";
export { resolveDayIntervals } from "./resolve-day";
export {
  assertValidTimezone,
  localMinutesToUtc,
  localDateKey,
  weekdayForLocalDate,
} from "./timezone";
export {
  SchedulingError,
  WEEKDAYS,
  type Weekday,
  type MinuteInterval,
  type WeeklyAvailabilityInput,
  type AvailabilityExceptionInput,
  type ReservationInput,
  type GenerateSlotsInput,
  type BookableSlot,
  type ActiveReservationStatus,
} from "./types";
