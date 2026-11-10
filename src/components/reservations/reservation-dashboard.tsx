"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DashboardReservation = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  cancelReason: string | null;
  counterpartName: string;
  canCancel: boolean;
};

function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function ReservationDashboard({
  reservations,
  now,
  emptyLabel,
}: {
  reservations: DashboardReservation[];
  now: string;
  emptyLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nowMs = Date.parse(now);
  const effective = reservations.map((reservation) =>
    cancelled.has(reservation.id)
      ? { ...reservation, status: "CANCELLED" as const, canCancel: false }
      : reservation,
  );
  const upcoming = effective.filter((row) => Date.parse(row.startsAt) >= nowMs);
  const past = effective.filter((row) => Date.parse(row.startsAt) < nowMs);

  async function cancel(reservation: DashboardReservation) {
    setPending(reservation.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/reservations/${reservation.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ reason: "Cancelled from dashboard" }),
        },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(body.error?.message ?? "The session could not be cancelled.");
        return;
      }
      setCancelled((current) => new Set(current).add(reservation.id));
      setMessage("Reservation cancelled. Your confirmation email is queued.");
      router.refresh();
    } catch {
      setError("The session could not be cancelled. Please try again.");
    } finally {
      setPending(null);
    }
  }

  function section(title: string, rows: DashboardReservation[]) {
    return (
      <section aria-labelledby={`${title.toLowerCase()}-reservations`}>
        <h2 id={`${title.toLowerCase()}-reservations`} className="text-lg font-semibold">
          {title}
        </h2>
        {rows.length ? (
          <ul className="mt-3 space-y-3">
            {rows.map((reservation) => (
              <li key={reservation.id}>
                <article
                  data-testid={`reservation-${reservation.id}`}
                  className="rounded border p-4"
                >
                  <h3 className="font-medium">{reservation.counterpartName}</h3>
                  <p>
                    <time dateTime={reservation.startsAt}>
                      {formatUtc(reservation.startsAt)}
                    </time>{" "}
                    – {reservation.endsAt.slice(11, 16)} UTC
                  </p>
                  <p className="text-sm">
                    Status: <strong>{reservation.status}</strong>
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer">Reservation details</summary>
                    <dl className="mt-2 text-sm text-gray-700">
                      <dt className="inline font-medium">Reservation ID: </dt>
                      <dd className="inline">{reservation.id}</dd>
                      {reservation.cancelReason ? (
                        <div>
                          <dt className="inline font-medium">Cancellation reason: </dt>
                          <dd className="inline">{reservation.cancelReason}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </details>
                  {reservation.canCancel ? (
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => cancel(reservation)}
                      className="mt-3 rounded border border-red-700 px-3 py-2 text-red-700 disabled:opacity-50"
                    >
                      {pending === reservation.id
                        ? "Cancelling…"
                        : `Cancel session with ${reservation.counterpartName}`}
                    </button>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-gray-600">{emptyLabel}</p>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div aria-live="polite">
        {message ? (
          <p role="status" className="text-green-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      {section("Upcoming", upcoming)}
      {section("Past", past)}
    </div>
  );
}
