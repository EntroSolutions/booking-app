"use client";

import ReservationDashboard, {
  type DashboardReservation,
} from "@/components/reservations/reservation-dashboard";

export default function CoachDashboard({
  reservations,
  now,
}: {
  reservations: DashboardReservation[];
  now: string;
}) {
  return (
    <section aria-labelledby="coach-reservations-heading">
      <h2 id="coach-reservations-heading" className="text-xl font-semibold">
        Your coaching reservations
      </h2>
      <div className="mt-4">
        <ReservationDashboard
          reservations={reservations}
          now={now}
          emptyLabel="No reservations in this section."
        />
      </div>
    </section>
  );
}
