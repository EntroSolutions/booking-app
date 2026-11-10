"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { startsAt: string; endsAt: string };

export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function BookingCalendar({
  coachId,
  initialSlots,
  canBook,
}: {
  coachId: string;
  initialSlots: Slot[];
  canBook: boolean;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initialSlots);
  const [selectedDate, setSelectedDate] = useState(
    initialSlots[0]?.startsAt.slice(0, 10) ?? "",
  );
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  const dates = useMemo(
    () => [...new Set(slots.map((slot) => slot.startsAt.slice(0, 10)))],
    [slots],
  );
  const visible = slots.filter(
    (slot) => slot.startsAt.slice(0, 10) === selectedDate,
  );

  async function refresh() {
    const response = await fetch(`/api/coaches/${coachId}/slots`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to refresh slots");
    const body = (await response.json()) as { slots: Slot[] };
    setSlots(body.slots);
    if (!body.slots.some((slot) => slot.startsAt.startsWith(selectedDate))) {
      setSelectedDate(body.slots[0]?.startsAt.slice(0, 10) ?? "");
    }
  }

  async function book(slot: Slot) {
    setPending(slot.startsAt);
    setMessage("");
    setError("");
    const key = keys.current.get(slot.startsAt) ?? crypto.randomUUID();
    keys.current.set(slot.startsAt, key);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({ coachId, startsAt: slot.startsAt }),
      });
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "The session could not be booked.");
        if (response.status === 409) await refresh();
        return;
      }
      keys.current.delete(slot.startsAt);
      setMessage("Session booked. Your confirmation email is queued.");
      await refresh();
      router.refresh();
    } catch {
      setError("The session could not be booked. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="available-sessions" className="space-y-4">
      <h2 id="available-sessions" className="text-xl font-semibold">
        Available sessions
      </h2>
      <p className="text-sm text-gray-600">All times are shown in UTC.</p>
      {dates.length ? (
        <div>
          <label htmlFor="booking-date" className="mr-2 font-medium">
            Booking date
          </label>
          <select
            id="booking-date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded border p-2"
          >
            {dates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div aria-live="polite">
        {message ? (
          <p role="status" className="text-green-700">
            {message}{" "}
            <Link href="/client" className="underline">
              View your reservations
            </Link>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      {visible.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Session slots">
          {visible.map((slot) => (
            <li key={slot.startsAt} className="rounded border p-4">
              <time dateTime={slot.startsAt}>{formatUtc(slot.startsAt)}</time>
              <p className="text-sm text-gray-600">
                Until {slot.endsAt.slice(11, 16)} UTC
              </p>
              {canBook ? (
                <button
                  type="button"
                  onClick={() => book(slot)}
                  disabled={pending !== null}
                  className="mt-3 rounded bg-black px-3 py-2 text-white disabled:opacity-50"
                >
                  {pending === slot.startsAt
                    ? "Booking…"
                    : `Book ${formatUtc(slot.startsAt)}`}
                </button>
              ) : (
                <Link
                  href={`/sign-in?callbackUrl=${encodeURIComponent(`/coaches/${coachId}`)}`}
                  className="mt-3 inline-block underline"
                >
                  Sign in to book
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No bookable slots found for this date.</p>
      )}
    </section>
  );
}
