import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClientDashboard from "@/app/dashboard/clientDashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("reservation dashboard", () => {
  it("renders upcoming reservations and their cancellation controls", () => {
    render(
      <ClientDashboard
        now="2026-01-05T08:00:00.000Z"
        reservations={[
          {
            id: "reservation-1",
            startsAt: "2026-01-05T14:00:00.000Z",
            endsAt: "2026-01-05T15:00:00.000Z",
            status: "CONFIRMED",
            cancelReason: null,
            counterpartName: "E2E Coach",
            canCancel: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("E2E Coach")).toBeInTheDocument();
    expect(screen.getByText("CONFIRMED")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel session with E2E Coach" }),
    ).toBeInTheDocument();
  });
});
