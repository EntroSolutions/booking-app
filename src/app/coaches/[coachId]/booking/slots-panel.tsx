"use client";

import { formatDayKeyLabel } from "./timezone";
import type { SlotView } from "./timezone";

/**
 * Renders the availability for a bounded date range as semantic grouped
 * lists (one `<section>` per local day), with skeleton, empty and error
 * states. Every slot is a real `<button>` so it is keyboard reachable.
 */
export type SlotsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; slots: SlotView[] };

interface Props {
  state: SlotsState;
  timeZone: string | null;
  selectedSlotId: string | null;
  onSelect: (slot: SlotView) => void;
}

function SlotList({
  slots,
  timeZone,
  selectedSlotId,
  onSelect,
}: Required<Pick<Props, "timeZone" | "selectedSlotId" | "onSelect">> & {
  slots: SlotView[];
}) {
  const days = new Map<string, SlotView[]>();
  for (const slot of slots) {
    const key =
      timeZone === "UTC"
        ? slot.startsAt.slice(0, 10)
        : new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone,
          }).format(new Date(slot.startsAt));
    const list = days.get(key) ?? [];
    list.push(slot);
    days.set(key, list);
  }

  return (
    <div>
      {Array.from(days.entries()).map(([dayKey, daySlots]) => (
        <section
          key={dayKey}
          aria-labelledby={`day-${dayKey}`}
          className="mt-6 first:mt-0"
        >
          <h3 id={`day-${dayKey}`} className="text-sm font-semibold text-gray-700">
            {timeZone
              ? formatDayKeyLabel(dayKey, timeZone)
              : `${dayKey} (UTC)`}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {daySlots.map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              return (
                <li key={slot.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(slot)}
                    className={`rounded border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                      isSelected
                        ? "border-black bg-black text-white"
                        : "border-gray-300 bg-white hover:border-black"
                    }`}
                  >
                    {formatSlotTime(slot.startsAt, timeZone)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatSlotTime(iso: string, timeZone: string | null): string {
  const zone = timeZone ?? "UTC";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
    timeZoneName: "short",
  }).format(new Date(iso));
  return formatted.replace(",", " ");
}

/** Accessible skeleton used while availability is loading. */
export function SlotsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" data-testid="slots-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mt-6 first:mt-0">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 flex gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-8 w-20 animate-pulse rounded bg-gray-200"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SlotsPanel({
  state,
  timeZone,
  selectedSlotId,
  onSelect,
}: Props) {
  return (
    <div role="region" aria-label="Available sessions">
      {state.status === "loading" && <SlotsSkeleton />}
      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {state.status === "empty" && (
        <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          No available sessions in this range. Try another date.
        </p>
      )}
      {state.status === "ready" && (
        <SlotList
          slots={state.slots}
          timeZone={timeZone}
          selectedSlotId={selectedSlotId}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
