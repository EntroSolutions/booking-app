"use client";

import Link from "next/link";
import { formatDateInZone, formatTime } from "./timezone";
import type { SlotView } from "./timezone";

/**
 * Checkout panel for a selected slot.
 *
 * - Signed-out visitors see a "sign in to book" link whose callback URL
 *   preserves the coach id and selected slot through the redirect.
 * - Signed-in clients see the confirm button; it is disabled while a booking
 *   request is in flight so duplicate submissions cannot fire.
 */
interface Props {
  slot: SlotView;
  timeZone: string;
  coachId: string;
  isSignedIn: boolean;
  isClient: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

export function CheckoutPanel({
  slot,
  timeZone,
  coachId,
  isSignedIn,
  isClient,
  submitting,
  onConfirm,
}: Props) {
  const { time, zoneLabel } = formatTime(slot.startsAt, timeZone);

  return (
    <section
      aria-labelledby="checkout-heading"
      data-testid="checkout-panel"
      className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-5"
    >
      <h2 id="checkout-heading" className="text-lg font-semibold">
        Confirm your session
      </h2>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-gray-600">Date</dt>
          <dd>{formatDateInZone(slot.startsAt, timeZone)}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-600">Time ({timeZone})</dt>
          <dd>
            <time dateTime={slot.startsAt}>
              {time} {zoneLabel}
            </time>
          </dd>
        </div>
      </dl>

      {!isSignedIn ? (
        <p className="mt-4 text-sm">
          <Link
            href={`/sign-in?callbackUrl=${encodeURIComponent(
              `/coaches/${coachId}?slot=${encodeURIComponent(slot.startsAt)}`,
            )}`}
            data-testid="checkout-sign-in-link"
            className="inline-block rounded bg-black px-4 py-2 text-white"
          >
            Sign in to book this time
          </Link>
        </p>
      ) : !isClient ? (
        <p className="mt-4 text-sm text-gray-600" role="note">
          Sessions can only be booked from a client account.
        </p>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          data-testid="confirm-booking"
          className="mt-4 rounded bg-black px-4 py-2 text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Booking…" : "Confirm booking"}
        </button>
      )}
    </section>
  );
}
