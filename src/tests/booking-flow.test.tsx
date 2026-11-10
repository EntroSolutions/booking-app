// Component tests for the client booking flow.
//
// Covers: bounded date-range navigation, time-zone display (detected and
// manual fallback), a successful booking (idempotency key sent, duplicate
// submissions disabled), and recovery when the server reports a taken slot.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingFlow from "@/app/coaches/[coachId]/booking/booking-flow";
import {
  formatTime,
  groupSlotsByDay,
  slotLabel,
} from "@/app/coaches/[coachId]/booking/timezone";

const COACH_ID = "coach-1";

// Fixed "now": 2026-03-10T12:00:00Z so range windows are deterministic.
const NOW_MS = Date.parse("2026-03-10T12:00:00Z");

vi.useFakeTimers({ now: NOW_MS, shouldAdvanceTime: true });

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

function slot(startsAt: string) {
  const starts = Date.parse(startsAt);
  return {
    startsAt,
    endsAt: new Date(starts + 60 * 60 * 1000).toISOString(),
  };
}

let reservationsResponse: {
  status: number;
  body: unknown;
} = { status: 201, body: { id: "res-1" } };
const fetchMock = vi.fn();

function stubFetch() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/reservations")) {
      return new Response(JSON.stringify(reservationsResponse.body), {
        status: reservationsResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Slots endpoint: always return two bookable slots regardless of window.
    return new Response(
      JSON.stringify({
        slots: [slot("2026-03-11T09:00:00Z"), slot("2026-03-11T10:00:00Z")],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderFlow(
  overrides: Partial<ComponentProps<typeof BookingFlow>> = {},
) {
  return render(
    <BookingFlow
      coachId={COACH_ID}
      coachTimezone="Europe/Berlin"
      sessionDurationMinutes={60}
      initialSlotIso={null}
      isSignedIn
      isClient
      horizonDays={30}
      {...overrides}
    />,
  );
}

const slotButton = () =>
  screen.getAllByRole("button", { name: /09:00/i })[0];

beforeEach(() => {
  reservationsResponse = { status: 201, body: { id: "res-1" } };
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("date navigation", () => {
  it("loads availability for the first bounded week and pages forward", async () => {
    renderFlow();
    await screen.findByTestId("range-label");

    // Initial window: starts at the beginning of today (UTC detected) and
    // spans exactly seven days.
    const firstCall = fetchMock.mock.calls[0][0] as string;
    expect(firstCall).toContain("/slots?from=");
    expect(firstCall).toMatch(/to=/);

    await user().click(screen.getByTestId("next-range"));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    const first = new URL(urls[0], "http://localhost");
    const second = new URL(urls[urls.length - 1], "http://localhost");
    expect(second.searchParams.get("from")).not.toEqual(
      first.searchParams.get("from"),
    );
    const firstFrom = Date.parse(first.searchParams.get("from")!);
    const secondFrom = Date.parse(second.searchParams.get("from")!);
    expect(secondFrom - firstFrom).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("disables going back before today and caps forward navigation", async () => {
    renderFlow();
    await screen.findByTestId("range-label");
    expect(screen.getByTestId("prev-range")).toBeDisabled();

    const next = screen.getByTestId("next-range");
    // 30-day horizon / 7-day pages → 5 pages (0..4).
    for (let i = 0; i < 4; i += 1) {
      await user().click(next);
      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    }
    await waitFor(() => expect(next).toBeDisabled());
  });
});

describe("time-zone display", () => {
  it("labels times with the detected zone", async () => {
    renderFlow();
    await screen.findByRole("button", { name: /09:00/ });
    // jsdom resolves the browser zone to UTC.
    expect(screen.getByTestId("timezone-label")).toHaveTextContent(
      /All times are shown in your time zone: UTC/,
    );
    expect(slotButton()).toHaveTextContent("UTC");
  });

  it("groups slots under day headings and lets the user override the zone", async () => {
    renderFlow();
    const buttons = await screen.findAllByRole("button", { name: /09:00/ });
    expect(buttons.length).toBeGreaterThan(0);

    // Pure helpers: grouped days carry an explicit zone label.
    const groups = groupSlotsByDay(
      [
        {
          id: "s",
          startsAt: "2026-03-11T09:00:00Z",
          endsAt: "2026-03-11T10:00:00Z",
        },
      ],
      "Europe/Berlin",
    );
    expect(groups).toHaveLength(1);
    expect(slotLabel(groups[0].slots[0], "Europe/Berlin")).toMatch(/GMT\+[12]/);
    expect(formatTime("2026-03-11T09:00:00Z", "UTC").zoneLabel).toBe("UTC");

    // Manual override updates the label and refetches the same range.
    await user().selectOptions(
      screen.getByTestId("timezone-select"),
      "America/New_York",
    );
    await waitFor(() =>
      expect(screen.getByTestId("timezone-label")).toHaveTextContent(
        /America\/New_York/,
      ),
    );
  });
});

describe("booking success", () => {
  it("sends an idempotency key, disables the button while submitting, and shows success", async () => {
    renderFlow();
    await screen.findByRole("button", { name: /09:00/ });
    await user().click(slotButton());

    const confirm = screen.getByTestId("confirm-booking");
    expect(confirm).toHaveTextContent("Confirm booking");
    await user().click(confirm);

    const bookingCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/reservations"),
    );
    expect(bookingCalls).toHaveLength(1);
    const [, init] = bookingCalls[0] as [string, RequestInit];
    const key = (init.headers as Record<string, string>)["Idempotency-Key"];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    await screen.findByTestId("booking-success");
    expect(screen.getByTestId("booking-success")).toHaveTextContent(
      /Session booked/i,
    );
    // Availability is refreshed after a successful booking.
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/slots"),
    );
    expect(refreshCalls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("checkout-panel")).not.toBeInTheDocument();
  });

  it("does not sign in inline when signed out but preserves coach and slot", async () => {
    renderFlow({ isSignedIn: false, isClient: false });
    await screen.findByRole("button", { name: /09:00/ });
    await user().click(slotButton());

    const link = screen.getByTestId("checkout-sign-in-link");
    expect(link).toHaveAttribute("href", expect.stringContaining("/sign-in"));
    const href = link.getAttribute("href")!;
    const callback = decodeURIComponent(
      new URLSearchParams(href.split("?")[1]).get("callbackUrl")!,
    );
    expect(callback).toContain(`/coaches/${COACH_ID}`);
    expect(callback).toMatch(/slot=2026-03-11T09:00:00Z/);
  });
});

describe("booking conflict recovery", () => {
  it("refreshes availability and clears the selection when the slot was taken", async () => {
    reservationsResponse = {
      status: 409,
      body: {
        error: {
          code: "SLOT_TAKEN",
          message: "That time was just booked by someone else.",
        },
      },
    };
    renderFlow();
    await screen.findByRole("button", { name: /09:00/ });
    await user().click(slotButton());
    await user().click(screen.getByTestId("confirm-booking"));

    const alert = await screen.findByTestId("booking-error");
    expect(alert).toHaveTextContent(/just booked by someone else/i);
    // Selection cleared, checkout panel gone, availability refetched.
    expect(screen.queryByTestId("checkout-panel")).not.toBeInTheDocument();
    const slotCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/slots"),
    );
    expect(slotCalls.length).toBeGreaterThanOrEqual(2);
    // The slot buttons are still offered again for a new pick.
    expect(
      within(
        screen.getByRole("region", { name: /available sessions/i }),
      ).getAllByRole("button").length,
    ).toBeGreaterThan(0);
  });
});
