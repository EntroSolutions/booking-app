import Link from "next/link";
import { requireCoach } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { generateSlots } from "@/lib/scheduling";
import { serverNow } from "@/server/clock";
import {
  isCancellationAllowed,
  policyFromEnv,
} from "@/lib/reservations/policy";
import CoachDashboard from "@/app/dashboard/coachDashboard";
import AvailabilityForm from "./availability-form";

export default async function CoachDashboardPage() {
  const user = await requireCoach({ callbackPath: "/coach" });
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    include: {
      weeklyAvailability: true,
      availabilityExceptions: true,
      reservations: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
      },
    },
  });
  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Coach dashboard</h1>
        <p className="mt-4">Your coach profile is not ready yet.</p>
      </main>
    );
  }

  const now = serverNow();
  const policy = policyFromEnv();
  const weekly = profile.weeklyAvailability.map(
    ({ weekday, startMinute, endMinute }) => ({
      weekday,
      startMinute,
      endMinute,
    }),
  );
  const exceptions = profile.availabilityExceptions.map((exception) => ({
    date: exception.date.toISOString().slice(0, 10),
    isUnavailable: exception.isUnavailable,
    startMinute: exception.startMinute,
    endMinute: exception.endMinute,
    reason: exception.reason ?? "",
  }));
  const slots = generateSlots({
    timezone: profile.timezone,
    sessionDurationMinutes: profile.sessionDurationMinutes,
    weeklyAvailability: weekly,
    exceptions,
    reservations: profile.reservations,
    leadTimeMinutes: policy.leadTimeMinutes,
    bookingHorizonDays: policy.bookingHorizonDays,
    now,
  });
  const reservations = await prisma.reservation.findMany({
    where: { coachId: profile.id },
    include: { client: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-8">
      <header>
        <h1 className="text-2xl font-bold">Coach availability</h1>
        <p className="mt-2 text-gray-600">
          Signed in as {user.email}. Configure recurring hours and exceptions below.
        </p>
      </header>
      <AvailabilityForm
        timezone={profile.timezone}
        duration={profile.sessionDurationMinutes}
        weekly={weekly}
        exceptions={exceptions}
      />
      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-lg font-semibold">
          Upcoming slot preview
        </h2>
        <p className="text-sm text-gray-600">
          Read-only preview of the next {policy.bookingHorizonDays} days (UTC).
        </p>
        {slots.length === 0 ? (
          <p className="mt-3">No bookable slots found.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {slots.slice(0, 20).map((slot) => (
              <li key={slot.startsAt} className="rounded border p-2 text-sm">
                <time dateTime={slot.startsAt}>
                  {slot.startsAt.slice(0, 10)} {slot.startsAt.slice(11, 16)} UTC
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CoachDashboard
        now={now.toISOString()}
        reservations={reservations.map((reservation) => ({
          id: reservation.id,
          startsAt: reservation.startsAt.toISOString(),
          endsAt: reservation.endsAt.toISOString(),
          status: reservation.status,
          cancelReason: reservation.cancelReason,
          counterpartName: reservation.client.name ?? "Client",
          canCancel:
            ["PENDING", "CONFIRMED"].includes(reservation.status) &&
            isCancellationAllowed(
              reservation.startsAt,
              now,
              policy.cancellationCutoffMinutes,
            ),
        }))}
      />
      <Link href="/sign-out" className="inline-block underline">
        Sign out
      </Link>
    </main>
  );
}
