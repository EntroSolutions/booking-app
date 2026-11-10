import { notFound } from "next/navigation";
import BookingCalendar from "@/components/booking-calendar";
import { getCurrentUser } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { listCoachSlots } from "@/server/reservations/service";

export default async function CoachSessionsPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = await params;
  const [coach, user] = await Promise.all([
    prisma.coachProfile.findUnique({
      where: { id: coachId },
      include: { user: { select: { name: true } } },
    }),
    getCurrentUser(),
  ]);
  if (!coach) notFound();
  const slots = await listCoachSlots(coach.id);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <h1 className="text-3xl font-bold">
          {coach.user.name ?? "Independent coach"}
        </h1>
        <p className="mt-2 text-gray-600">{coach.bio}</p>
        <p className="mt-2 text-sm">
          {coach.sessionDurationMinutes}-minute sessions · Coach time zone: {coach.timezone}
        </p>
      </header>
      <BookingCalendar
        coachId={coach.id}
        initialSlots={slots}
        canBook={user?.role === "CLIENT"}
      />
    </main>
  );
}
