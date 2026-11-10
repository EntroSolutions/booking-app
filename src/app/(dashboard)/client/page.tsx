import Link from "next/link";
import { requireClient } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { serverNow } from "@/server/clock";
import {
  isCancellationAllowed,
  policyFromEnv,
} from "@/lib/reservations/policy";
import ClientDashboard from "@/app/dashboard/clientDashboard";

export default async function ClientDashboardPage() {
  const user = await requireClient({ callbackPath: "/client" });
  const now = serverNow();
  const policy = policyFromEnv();
  const reservations = await prisma.reservation.findMany({
    where: { clientId: user.id },
    include: { coach: { include: { user: { select: { name: true } } } } },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <p className="mb-4 text-gray-600">Signed in as {user.email}.</p>
      <ClientDashboard
        now={now.toISOString()}
        reservations={reservations.map((reservation) => ({
          id: reservation.id,
          startsAt: reservation.startsAt.toISOString(),
          endsAt: reservation.endsAt.toISOString(),
          status: reservation.status,
          cancelReason: reservation.cancelReason,
          counterpartName: reservation.coach.user.name ?? "Your coach",
          canCancel:
            ["PENDING", "CONFIRMED"].includes(reservation.status) &&
            isCancellationAllowed(
              reservation.startsAt,
              now,
              policy.cancellationCutoffMinutes,
            ),
        }))}
      />
      <div className="mt-6 flex gap-4">
        <Link href="/coaches" className="underline">
          Book another session
        </Link>
        <Link href="/sign-out" className="underline">
          Sign out
        </Link>
      </div>
    </div>
  );
}
