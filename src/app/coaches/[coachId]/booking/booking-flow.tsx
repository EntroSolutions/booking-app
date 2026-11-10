"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ApiError, SLOT_CONFLICT_CODES, bookSlot, fetchSlots } from "./api";
import { CheckoutPanel } from "./checkout";
import { SlotsPanel, type SlotsState } from "./slots-panel";
import {
  FALLBACK_TIMEZONES,
  formatTime,
  useBrowserTimezone,
} from "./timezone";
import type { SlotView } from "./timezone";

/** Days fetched per range; the calendar pages one week at a time. */
const RANGE_DAYS = 7;

export interface BookingFlowProps {
  coachId: string;
  /** The coach's IANA time zone, shown as context for the client. */
  coachTimezone: string;
  sessionDurationMinutes: number;
  /**
   * Slot instant (ISO) restored from the `?slot=` query parameter, so a
   * selection survives the sign-in redirect.
   */
  initialSlotIso: string | null;
  isSignedIn: boolean;
  isClient: boolean;
  /** Local-calendar end of the bookable horizon (ISO). */
  horizonDays: number;
}

/**
 * Builds the half-open UTC window for `offset` weeks after today, anchored to
 * the start of the local day in the viewer's zone.
 */
export function rangeWindow(
  offsetWeeks: number,
  timeZone: string,
  nowMs = Date.now(),
): { from: string; to: string; startMs: number } {
  const localStart = DateTime.fromMillis(nowMs)
    .setZone(timeZone)
    .startOf("day")
    .plus({ days: offsetWeeks * RANGE_DAYS });
  const from = localStart.toUTC().toISO() ?? new Date(nowMs).toISOString();
  const to = localStart
    .plus({ days: RANGE_DAYS })
    .toUTC()
    .toISO() as string;
  return { from, to, startMs: localStart.toMillis() };
}

/** Human label for a range start, e.g. "Mar 3 – Mar 9". */
export function rangeLabel(offsetWeeks: number, timeZone: string): string {
  const now = DateTime.now().setZone(timeZone).startOf("day");
  const start = now.plus({ days: offsetWeeks * RANGE_DAYS });
  const end = start.plus({ days: RANGE_DAYS - 1 });
  const fmt = (d: DateTime) =>
    d.toFormat("LLL d", { locale: undefined });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function BookingFlow({
  coachId,
  coachTimezone,
  sessionDurationMinutes,
  initialSlotIso,
  isSignedIn,
  isClient,
  horizonDays,
}: BookingFlowProps) {
  const detected = useBrowserTimezone();
  const [manualZone, setManualZone] = useState<string | null>(null);
  // Effective zone: explicit override → browser detection → UTC fallback.
  const timeZone = manualZone ?? detected ?? "UTC";
  const detectionFailed = !detected && !manualZone;

  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [slotsState, setSlotsState] = useState<SlotsState>({
    status: "loading",
  });
  const [selected, setSelected] = useState<SlotView | null>(
    initialSlotIso ? { id: initialSlotIso, startsAt: initialSlotIso, endsAt: initialSlotIso } : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [booked, setBooked] = useState<SlotView | null>(null);

  // One stable idempotency key per (coach, slot): retries reuse the key, a
  // successful booking discards it, and a conflict discards it too.
  const keysRef = useRef(new Map<string, string>());

  const maxWeeks = Math.max(1, Math.ceil(horizonDays / RANGE_DAYS));
  const window = useMemo(
    () => rangeWindow(offsetWeeks, timeZone),
    [offsetWeeks, timeZone],
  );

  // Fetch availability for the current bounded range. The request is bound to
  // the zone + week so changing either re-fetches a fresh window.
  useEffect(() => {
    const controller = new AbortController();
    setSlotsState({ status: "loading" });
    fetchSlots(coachId, window.from, window.to, controller.signal)
      .then((slots) => {
        setSlotsState(
          slots.length === 0
            ? { status: "empty" }
            : {
                status: "ready",
                slots: slots.map((slot) => ({
                  id: slot.startsAt,
                  startsAt: slot.startsAt,
                  endsAt: slot.endsAt,
                })),
              },
        );
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        setSlotsState({
          status: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "We could not load availability. Please try again.",
        });
      });
    return () => controller.abort();
  }, [coachId, window.from, window.to]);

  /** Reload the current range (used after a conflict or successful booking). */
  const refreshRange = useCallback(async () => {
    try {
      const slots = await fetchSlots(coachId, window.from, window.to);
      setSlotsState(
        slots.length === 0
          ? { status: "empty" }
          : {
              status: "ready",
              slots: slots.map((slot) => ({
                id: slot.startsAt,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
              })),
            },
      );
    } catch {
      setSlotsState({
        status: "error",
        message: "We could not load availability. Please try again.",
      });
    }
  }, [coachId, window.from, window.to]);

  async function confirmBooking() {
    if (!selected) return;
    const iso = selected.startsAt;
    const existing = keysRef.current.get(iso);
    const key = existing ?? crypto.randomUUID();
    keysRef.current.set(iso, key);

    setBookingError(null);
    setSubmitting(true);
    try {
      await bookSlot({ coachId, startsAt: iso, idempotencyKey: key });
      keysRef.current.delete(iso);
      setBooked(selected);
      setSelected(null);
      await refreshRange();
    } catch (error) {
      keysRef.current.delete(iso);
      if (error instanceof ApiError && SLOT_CONFLICT_CODES.has(error.code)) {
        // The slot was taken (or is no longer offered) between listing and
        // commit: drop the stale selection and reload live availability.
        setSelected(null);
        setBookingError(
          error.code === "SLOT_TAKEN"
            ? "That time was just booked by someone else. Available times have been refreshed."
            : "That time is no longer available. Available times have been refreshed.",
        );
        await refreshRange();
        return;
      }
      setBookingError(
        error instanceof ApiError
          ? error.message
          : "The session could not be booked. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function restoreInitialSlot(
    state: SlotsState,
    pending: SlotView | null,
  ): SlotView | null {
    if (!pending) return null;
    if (state.status === "ready") {
      const match = state.slots.find((slot) => slot.startsAt === pending.startsAt);
      if (match) return match;
    }
    return null;
  }

  // Restore the slot carried through the sign-in redirect only while it is
  // still bookable in the freshly fetched availability.
  const pendingSelection = useRef(
    initialSlotIso
      ? ({ id: initialSlotIso, startsAt: initialSlotIso, endsAt: initialSlotIso } as SlotView)
      : null,
  );
  useEffect(() => {
    if (!pendingSelection.current || slotsState.status !== "ready") return;
    setSelected(restoreInitialSlot(slotsState, pendingSelection.current));
    pendingSelection.current = null;
  }, [slotsState]);

  const { time, zoneLabel } = selected
    ? formatTime(selected.startsAt, timeZone)
    : { time: "", zoneLabel: "" };

  return (
    <section aria-labelledby="available-sessions" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="available-sessions" className="text-xl font-semibold">
          Available sessions ({sessionDurationMinutes} minutes)
        </h2>
        <div>
          <label htmlFor="viewer-timezone" className="mr-2 text-sm font-medium">
            Time zone
          </label>
          <select
            id="viewer-timezone"
            data-testid="timezone-select"
            value={timeZone}
            onChange={(event) => setManualZone(event.target.value)}
            className="rounded border border-gray-300 p-2 text-sm"
          >
            {!detected && !manualZone && <option value="UTC">UTC</option>}
            {Array.from(
              new Set(
                detected
                  ? [detected, coachTimezone, ...FALLBACK_TIMEZONES]
                  : [coachTimezone, ...FALLBACK_TIMEZONES],
              ),
            ).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-sm text-gray-600" data-testid="timezone-label">
        {detectionFailed
          ? "We could not detect your time zone — all times are shown in UTC. Pick your zone above to correct this."
          : `All times are shown in your time zone: ${timeZone}.`}
      </p>

      {/* Range navigation: real buttons, keyboard reachable, no grid. */}
      <nav aria-label="Availability date range" className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOffsetWeeks((w) => Math.max(0, w - 1))}
          disabled={offsetWeeks === 0}
          data-testid="prev-range"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Previous week
        </button>
        <span aria-live="polite" data-testid="range-label" className="min-w-40 text-sm font-medium">
          {rangeLabel(offsetWeeks, timeZone)}
        </span>
        <button
          type="button"
          onClick={() => setOffsetWeeks((w) => Math.min(maxWeeks - 1, w + 1))}
          disabled={offsetWeeks >= maxWeeks - 1}
          data-testid="next-range"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next week →
        </button>
      </nav>

      <div aria-live="polite" className="space-y-2">
        {booked && (
          <p role="status" data-testid="booking-success" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Session booked for {formatTime(booked.startsAt, timeZone).time}{" "}
            {formatTime(booked.startsAt, timeZone).zoneLabel} ({timeZone}). A
            confirmation email is on its way.{" "}
            <Link href="/dashboard/client" className="underline">
              View your reservations
            </Link>
          </p>
        )}
        {bookingError && (
          <p role="alert" data-testid="booking-error" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {bookingError}
          </p>
        )}
      </div>

      <SlotsPanel
        state={slotsState}
        timeZone={timeZone}
        selectedSlotId={selected?.id ?? null}
        onSelect={(slot) => {
          setBooked(null);
          setBookingError(null);
          setSelected(slot);
        }}
      />

      {selected && (
        <CheckoutPanel
          slot={selected}
          timeZone={timeZone}
          coachId={coachId}
          isSignedIn={isSignedIn}
          isClient={isClient}
          submitting={submitting}
          onConfirm={confirmBooking}
        />
      )}

      {/* Hidden live region announcing the focused selection for screen readers. */}
      <span className="sr-only" aria-live="polite">
        {selected ? `Selected ${time} ${zoneLabel} ${timeZone}` : ""}
      </span>
    </section>
  );
}
