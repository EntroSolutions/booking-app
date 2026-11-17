// Unit tests for the transactional email templates. Rendering is pure, so no
// database or email provider is needed: we check that every draft states the
// session time in the recipient's time zone, names the other participant,
// links back to the right dashboard, and never leaks unescaped user text.
import { describe, expect, it } from "vitest";
import {
  bookingConfirmationEmails,
  cancellationEmails,
  clientDashboardUrl,
  coachDashboardUrl,
  formatInZone,
  type SessionEmailData,
} from "@/lib/email/templates";

const baseData: SessionEmailData = {
  reservationId: "res_123",
  startsAt: "2026-01-05T14:00:00.000Z",
  endsAt: "2026-01-05T15:00:00.000Z",
  status: "confirmed",
  client: { name: "Ada", email: "ada@example.com", timeZone: "Europe/Paris" },
  coach: { name: "Coach Kim", email: "kim@example.com", timeZone: "UTC" },
  dashboardBaseUrl: "https://booking.example.com",
};

describe("formatInZone", () => {
  it("formats an instant with weekday, date, time and offset", () => {
    const text = formatInZone("2026-01-05T14:00:00.000Z", "UTC");
    expect(text).toContain("January 5, 2026");
    expect(text).toContain("2:00");
    expect(text).toContain("UTC");
  });

  it("renders the local time for a shifted zone", () => {
    const text = formatInZone("2026-01-05T14:00:00.000Z", "Asia/Tokyo");
    // 23:00 local time, rendered as "11:00 PM" by the en-US template
    expect(text).toContain("11:00");
    expect(text).toContain("PM");
    expect(text).toContain("Asia/Tokyo");
  });

  it("falls back to UTC for an invalid zone instead of throwing", () => {
    const text = formatInZone("2026-01-05T14:00:00.000Z", "Mars/Olympus");
    expect(text).toContain("UTC");
  });

  it("rejects timestamps without an explicit offset", () => {
    expect(() => formatInZone("2026-01-05T14:00:00", "UTC")).toThrow();
  });
});

describe("dashboard links", () => {
  it("builds role-specific dashboard URLs and strips trailing slashes", () => {
    expect(clientDashboardUrl("https://app.example.com/")).toBe(
      "https://app.example.com/dashboard/client",
    );
    expect(coachDashboardUrl("https://app.example.com")).toBe(
      "https://app.example.com/dashboard/coach",
    );
  });
});

describe("booking confirmation emails", () => {
  it("creates one draft per participant", () => {
    const drafts = bookingConfirmationEmails(baseData);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.recipient).sort()).toEqual([
      "ada@example.com",
      "kim@example.com",
    ]);
    expect(drafts.every((d) => d.kind === "BOOKING_CONFIRMATION")).toBe(true);
  });

  it("shows the session time in the recipient's own zone", () => {
    const [clientDraft, coachDraft] = bookingConfirmationEmails(baseData);
    // 15:00 in Paris (UTC+1 in winter), 14:00 in UTC
    // 15:00 in Paris (UTC+1 in winter), 14:00 in UTC; rendered as "3:00 PM"
    expect(clientDraft.text).toContain("3:00");
    expect(clientDraft.text).toContain("Europe/Paris");
    expect(coachDraft.text).toContain("2:00");
    expect(coachDraft.text).toContain("(UTC,");
  });

  it("names the counterpart and the session duration", () => {
    const [clientDraft, coachDraft] = bookingConfirmationEmails(baseData);
    expect(clientDraft.text).toContain("Coach: Coach Kim");
    expect(clientDraft.text).toContain("Duration: 60 minutes");
    expect(coachDraft.text).toContain("Client: Ada");
  });

  it("links each participant to their dashboard", () => {
    const [clientDraft, coachDraft] = bookingConfirmationEmails(baseData);
    expect(clientDraft.text).toContain("/dashboard/client");
    expect(coachDraft.text).toContain("/dashboard/coach");
    expect(clientDraft.html).toContain("https://booking.example.com/dashboard/client");
  });

  it("escapes HTML in user-controlled text", () => {
    const drafts = bookingConfirmationEmails({
      ...baseData,
      client: {
        name: '<script>alert("x")</script>',
        email: "ada@example.com",
        timeZone: "UTC",
      },
    });
    const clientDraft = drafts.find((d) => d.recipient === "ada@example.com")!;
    expect(clientDraft.html).not.toContain("<script>");
    expect(clientDraft.html).toContain("&lt;script&gt;");
  });
});

describe("cancellation emails", () => {
  it("creates drafts with a cancelled status and cancellation subject", () => {
    const drafts = cancellationEmails({
      ...baseData,
      status: "cancelled",
      cancelReason: "Schedule conflict",
    });
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.kind === "CANCELLATION_CONFIRMATION")).toBe(
      true,
    );
    for (const draft of drafts) {
      expect(draft.text).toContain("Reason: Schedule conflict");
      expect(draft.subject).toContain("cancelled");
      expect(draft.text).toContain("Status: cancelled");
      expect(draft.text).toContain("Reservation: res_123");
    }
  });
});
