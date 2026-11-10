"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Returns the browser's IANA time zone (e.g. "Europe/Berlin") or null when
 * `Intl` cannot determine one. `null` signals the UI to show a manual
 * fallback selector instead of a possibly-wrong label.
 */
export function useBrowserTimezone(): string | null {
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(tz || null);
    } catch {
      setTimezone(null);
    }
  }, []);

  return timezone;
}

/** Common time zones offered in the fallback selector. */
export const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

/** Formats an ISO instant for a time zone with short fallbacks. */
export function formatTime(
  iso: string,
  timeZone: string,
): { time: string; zoneLabel: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { time: iso, zoneLabel: timeZone };
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
  const parts = fmt.formatToParts(date);
  const time = parts
    .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "dayPeriod")
    .map((p) => p.value)
    .join("");
  const zoneLabel =
    parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  return { time: time || fmt.format(date), zoneLabel };
}

/** Formats the local calendar date of an instant in `timeZone`. */
export function formatDateInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

/** A slot grouped under a calendar day in the viewer's zone. */
export interface SlotView {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface DayGroup {
  /** Calendar date `YYYY-MM-DD` in the viewer's zone. */
  date: string;
  /** Display label, e.g. "Monday, March 3, 2026". */
  label: string;
  slots: SlotView[];
}

/**
 * Groups slots into per-day lists in the viewer's time zone. Grouped lists
 * (not a mouse-only calendar grid) keep the markup semantic and navigable
 * with a keyboard.
 */
export function groupSlotsByDay(
  slots: SlotView[],
  timeZone: string,
): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const slot of slots) {
    const date = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).format(new Date(slot.startsAt));
    let group = map.get(date);
    if (!group) {
      group = {
        date,
        label: formatDateInZone(slot.startsAt, timeZone),
        slots: [],
      };
      map.set(date, group);
    }
    group.slots.push(slot);
  }
  return Array.from(map.values());
}

/**
 * Formats a `YYYY-MM-DD` day key into a human label for a given zone without
 * shifting dates (parses as noon UTC to avoid DST edge cases).
 */
export function formatDayKeyLabel(dayKey: string, timeZone: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

/** Stable helper for tests: format a slot as "HH:mm (Zone)" in a zone. */
export function slotLabel(slot: SlotView, timeZone: string): string {
  const { time, zoneLabel } = formatTime(slot.startsAt, timeZone);
  return `${time} ${zoneLabel}`;
}

export function useSlotGroups(slots: SlotView[], timeZone: string) {
  return useMemo(
    () => (timeZone ? groupSlotsByDay(slots, timeZone) : []),
    [slots, timeZone],
  );
}
