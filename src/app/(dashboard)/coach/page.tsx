import Link from "next/link";
import { requireCoach } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { generateSlots } from "@/lib/scheduling";
import AvailabilityForm from "./availability-form";

export default async function CoachDashboardPage() {
  const user = await requireCoach({ callbackPath: "/coach" });
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, include: { weeklyAvailability: true, availabilityExceptions: true, reservations: { where: { status: { in: ["PENDING", "CONFIRMED"] } } } } });
  if (!profile) return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-bold">Coach dashboard</h1><p className="mt-4">Your coach profile is not ready yet.</p></main>;
  const weekly = profile.weeklyAvailability.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }));
  const exceptions = profile.availabilityExceptions.map((e) => ({ date: e.date.toISOString().slice(0, 10), isUnavailable: e.isUnavailable, startMinute: e.startMinute, endMinute: e.endMinute, reason: e.reason ?? "" }));
  const slots = generateSlots({ timezone: profile.timezone, sessionDurationMinutes: profile.sessionDurationMinutes, weeklyAvailability: weekly, exceptions, reservations: profile.reservations, leadTimeMinutes: 0, bookingHorizonDays: 14 });
  return <main className="mx-auto max-w-3xl space-y-10 p-8"><header><h1 className="text-2xl font-bold">Coach availability</h1><p className="mt-2 text-gray-600">Signed in as {user.email}. Configure recurring hours and exceptions below.</p></header><AvailabilityForm timezone={profile.timezone} duration={profile.sessionDurationMinutes} weekly={weekly} exceptions={exceptions} /><section aria-labelledby="preview-heading"><h2 id="preview-heading" className="text-lg font-semibold">Upcoming slot preview</h2><p className="text-sm text-gray-600">Read-only preview of the next 14 days (shown in UTC).</p>{slots.length === 0 ? <p className="mt-3">No bookable slots found.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{slots.slice(0, 20).map(slot => <li key={slot.startsAt} className="rounded border p-2 text-sm">{new Date(slot.startsAt).toLocaleString()} – {new Date(slot.endsAt).toLocaleTimeString()}</li>)}</ul>}</section><Link href="/sign-out" className="underline">Sign out</Link></main>;
}
