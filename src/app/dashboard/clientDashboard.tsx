"use client";

import DashboardLayout from "../shared/DashboardLayout";
import ReservationDashboard, {
  type DashboardReservation,
} from "@/components/reservations/reservation-dashboard";

export default function ClientDashboard({
  reservations,
  now,
}: {
  reservations: DashboardReservation[];
  now: string;
}) {
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">Your reservations</h1>
      <div className="mt-6">
        <ReservationDashboard
          reservations={reservations}
          now={now}
          emptyLabel="No reservations in this section."
        />
      </div>
    </DashboardLayout>
  );
}
