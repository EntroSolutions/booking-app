import { notFound } from "next/navigation";
import BookingFlow from "@/app/coaches/[coachId]/booking/booking-flow";
import { getCurrentUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { policyFromEnv } from "@/lib/reservations/policy";

export const metadata = { title: "Coach sessions | Booking App" };

export default async function CoachSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  const [{ coachId }, { slot }] = await Promise.all([params, searchParams]);
  const [coach, user] = await Promise.all([
    prisma.coachProfile.findUnique({
      where: { id: coachId },
      include: { user: { select: { name: true } } },
    }),
    getCurrentUser(),
  ]);
  if (!coach) notFound();

  // Only restore a slot from the query string when it is a plausible instant;
  // anything else is ignored rather than rendered.
  const initialSlotIso =
    typeof slot === "string" && !Number.isNaN(Date.parse(slot))
      ? new Date(slot).toISOString()
      : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <h1 className="text-3xl font-bold">
          {coach.user.name ?? "Independent coach"}
        </h1>
        <p className="mt-2 text-gray-600">{coach.bio}</p>
        <p className="mt-2 text-sm">
          {coach.sessionDurationMinutes}-minute sessions · Coach time zone:{" "}
          {coach.timezone}
        </p>
      </header>
      <BookingFlow
        coachId={coach.id}
        coachTimezone={coach.timezone}
        sessionDurationMinutes={coach.sessionDurationMinutes}
        initialSlotIso={initialSlotIso}
        isSignedIn={Boolean(user)}
        isClient={user?.role === "CLIENT"}
        horizonDays={policyFromEnv().bookingHorizonDays}
      />
    </main>
  );
}
