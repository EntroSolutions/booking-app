// Reusable transactional email templates for reservation notifications.
//
// These are pure functions: they take template data and return the subject,
// plain-text and HTML bodies. Keeping rendering free of I/O means the wording,
// time-zone labels and dashboard links can be unit-tested without a database
// or an email provider, and the outbox can persist the rendered bodies so a
// retry never re-renders from possibly changed data.
//
// Every message states the session time in the recipient's relevant time zone,
// the other participant, the reservation status, and a link back to the
// reservation dashboard.

export type EmailKind = "BOOKING_CONFIRMATION" | "CANCELLATION_CONFIRMATION";

/** A message ready to be written to the outbox. */
export interface EmailDraft {
  kind: EmailKind;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailParticipant {
  name: string | null;
  email: string;
  /**
   * IANA time zone the session time is displayed in for this participant.
   * Coaches always know theirs; clients fall back to UTC until they share one.
   */
  timeZone: string;
}

export interface SessionEmailData {
  reservationId: string;
  /** Absolute instants, ISO 8601 with offset. */
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled";
  client: EmailParticipant;
  coach: EmailParticipant;
  /** Canonical app origin, e.g. `https://booking.example.com`. */
  dashboardBaseUrl: string;
  cancelReason?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function assertIso(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new Error(`${field} must be an ISO 8601 timestamp with an offset`);
  }
}

/**
 * Human time in a named zone, e.g.
 * "Monday, January 5, 2026 at 2:00 PM (CET, UTC+01:00)".
 * Unknown/invalid zones fall back to UTC so a malformed coach setting can
 * never block a confirmation email.
 */
export function formatInZone(iso: string, timeZone: string): string {
  assertIso(iso, "timestamp");
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: isValidZone(timeZone) ? timeZone : "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const offset = get("timeZoneName"); // "GMT+01:00" in en-US
  const offsetLabel = offset === "GMT" ? "UTC" : offset.replace(/^GMT/, "UTC");
  const shortZone = isValidZone(timeZone) ? timeZone : "UTC";
  return `${get("weekday")}, ${get("month")} ${get("day")}, ${get("year")} at ${get("hour")}:${get("minute")} ${get("dayPeriod")} (${shortZone}, ${offsetLabel})`;
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function clientDashboardUrl(baseUrl: string): string {
  return `${stripTrailingSlash(baseUrl)}/dashboard/client`;
}

export function coachDashboardUrl(baseUrl: string): string {
  return `${stripTrailingSlash(baseUrl)}/dashboard/coach`;
}

function stripTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function durationMinutes(data: SessionEmailData): number {
  return Math.round((Date.parse(data.endsAt) - Date.parse(data.startsAt)) / 60_000);
}

function sessionSummary(
  data: SessionEmailData,
  viewer: "client" | "coach",
): string {
  const zone = viewer === "client" ? data.client.timeZone : data.coach.timeZone;
  const counterpart =
    viewer === "client"
      ? `Coach: ${data.coach.name ?? data.coach.email}`
      : `Client: ${data.client.name ?? data.client.email}`;
  return [
    `Session: ${formatInZone(data.startsAt, zone)} – ${formatInZone(data.endsAt, zone)}`,
    `Duration: ${durationMinutes(data)} minutes`,
    counterpart,
    `Status: ${data.status}`,
    `Reservation: ${data.reservationId}`,
  ].join("\n");
}

function renderHtml(title: string, summary: string, ctaUrl: string): string {
  const lines = summary
    .split("\n")
    .map(
      (line) =>
        `<tr><td style="padding:4px 0;font-size:14px;color:#1f2937;">${escapeHtml(line)}</td></tr>`,
    )
    .join("");
  return [
    '<!doctype html><html><body style="margin:0;background:#f3f4f6;">',
    '<div style="max-width:520px;margin:24px auto;padding:24px;background:#ffffff;',
    'border-radius:8px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">',
    `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>`,
    `<table role="presentation" style="width:100%;border-collapse:collapse;">${lines}</table>`,
    '<p style="margin:24px 0 0;">',
    `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 18px;`,
    'background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;',
    'font-size:14px;">View your reservations</a></p>',
    "</div></body></html>",
  ].join("");
}

/** Client copy of the booking confirmation. */
export function bookingConfirmationForClient(
  data: SessionEmailData,
): EmailDraft {
  const summary = sessionSummary(data, "client");
  const url = clientDashboardUrl(data.dashboardBaseUrl);
  return {
    kind: "BOOKING_CONFIRMATION",
    recipient: data.client.email,
    subject: "Your coaching session is confirmed",
    text: `Your session is confirmed.\n\n${summary}\n\nManage it: ${url}`,
    html: renderHtml("Your coaching session is confirmed", summary, url),
  };
}

/** Coach copy of the booking confirmation. */
export function bookingConfirmationForCoach(
  data: SessionEmailData,
): EmailDraft {
  const summary = sessionSummary(data, "coach");
  const url = coachDashboardUrl(data.dashboardBaseUrl);
  return {
    kind: "BOOKING_CONFIRMATION",
    recipient: data.coach.email,
    subject: "New coaching session booked",
    text: `A new session was booked with you.\n\n${summary}\n\nManage it: ${url}`,
    html: renderHtml("New coaching session booked", summary, url),
  };
}

/** Client copy of the cancellation notice. */
export function cancellationForClient(data: SessionEmailData): EmailDraft {
  const summary = sessionSummary(data, "client");
  const reason = data.cancelReason ? `\nReason: ${data.cancelReason}` : "";
  const url = clientDashboardUrl(data.dashboardBaseUrl);
  return {
    kind: "CANCELLATION_CONFIRMATION",
    recipient: data.client.email,
    subject: "Your coaching session was cancelled",
    text: `Your session was cancelled.\n\n${summary}${reason}\n\nBook again: ${url}`,
    html: renderHtml("Your coaching session was cancelled", `${summary}${reason}`, url),
  };
}

/** Coach copy of the cancellation notice. */
export function cancellationForCoach(data: SessionEmailData): EmailDraft {
  const summary = sessionSummary(data, "coach");
  const reason = data.cancelReason ? `\nReason: ${data.cancelReason}` : "";
  const url = coachDashboardUrl(data.dashboardBaseUrl);
  return {
    kind: "CANCELLATION_CONFIRMATION",
    recipient: data.coach.email,
    subject: "A coaching session was cancelled",
    text: `A session with you was cancelled.\n\n${summary}${reason}\n\nYour agenda: ${url}`,
    html: renderHtml("A coaching session was cancelled", `${summary}${reason}`, url),
  };
}

/** Both participant copies of a booking confirmation. */
export function bookingConfirmationEmails(data: SessionEmailData): EmailDraft[] {
  return [bookingConfirmationForClient(data), bookingConfirmationForCoach(data)];
}

/** Both participant copies of a cancellation notice. */
export function cancellationEmails(data: SessionEmailData): EmailDraft[] {
  return [cancellationForClient(data), cancellationForCoach(data)];
}
