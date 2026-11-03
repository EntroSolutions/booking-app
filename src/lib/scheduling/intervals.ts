import { SchedulingError, type MinuteInterval } from "./types";

const MIN_MINUTE = 0;
const MAX_MINUTE = 1440;

/** Reject malformed minute windows (mirrors DB CHECK constraints). */
export function assertValidInterval(
  interval: MinuteInterval,
  label = "interval",
): void {
  const { startMinute, endMinute } = interval;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
    throw new SchedulingError(`${label}: minutes must be integers`);
  }
  if (startMinute < MIN_MINUTE || endMinute > MAX_MINUTE) {
    throw new SchedulingError(
      `${label}: minutes must satisfy 0 <= start < end <= 1440`,
    );
  }
  if (startMinute >= endMinute) {
    throw new SchedulingError(
      `${label}: startMinute must be strictly less than endMinute`,
    );
  }
}

/** Sort by start, then merge overlapping or adjacent intervals. */
export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const merged: MinuteInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, current.endMinute);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Subtract `block` from `source` (half-open intervals). */
export function subtractInterval(
  source: MinuteInterval,
  block: MinuteInterval,
): MinuteInterval[] {
  if (block.endMinute <= source.startMinute || block.startMinute >= source.endMinute) {
    return [{ ...source }];
  }

  const result: MinuteInterval[] = [];
  if (block.startMinute > source.startMinute) {
    result.push({
      startMinute: source.startMinute,
      endMinute: Math.max(source.startMinute, block.startMinute),
    });
  }
  if (block.endMinute < source.endMinute) {
    result.push({
      startMinute: Math.min(source.endMinute, block.endMinute),
      endMinute: source.endMinute,
    });
  }
  return result.filter((i) => i.startMinute < i.endMinute);
}

/** Apply a list of blocks against a list of allowed intervals. */
export function subtractAll(
  sources: MinuteInterval[],
  blocks: MinuteInterval[],
): MinuteInterval[] {
  let remaining = sources;
  for (const block of blocks) {
    remaining = remaining.flatMap((s) => subtractInterval(s, block));
  }
  return mergeIntervals(remaining);
}

/**
 * Slice an allowed interval into fixed-duration slots that fit entirely inside.
 * Slots are contiguous from the interval start (no gaps between sessions).
 */
export function sliceSlots(
  interval: MinuteInterval,
  durationMinutes: number,
): MinuteInterval[] {
  const slots: MinuteInterval[] = [];
  let cursor = interval.startMinute;
  while (cursor + durationMinutes <= interval.endMinute) {
    slots.push({
      startMinute: cursor,
      endMinute: cursor + durationMinutes,
    });
    cursor += durationMinutes;
  }
  return slots;
}
