import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  bookReservation,
  cancelReservation,
  listCoachSlots,
} from "@/server/reservations/service";
import {
  E2E_IDS,
  resetDatabaseForTests,
} from "@/server/testing/data";

const NOW = new Date("2026-01-05T08:00:00.000Z");
const START = "2026-01-05T14:00:00.000Z";

process.env.BOOKING_LEAD_TIME_MINUTES = "0";
process.env.BOOKING_CANCELLATION_CUTOFF_MINUTES = "0";
process.env.RATE_LIMIT_STORE = "memory";

describe("reservation database integration", () => {
  beforeEach(async () => {
    await resetDatabaseForTests(NOW);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("atomically rejects a double booking and creates only one email", async () => {
    const results = await Promise.allSettled([
      bookReservation({
        coachId: E2E_IDS.coachProfile,
        clientId: E2E_IDS.clientUser,
        startsAt: START,
        idempotencyKey: "integration-first-key",
        now: NOW,
      }),
      bookReservation({
        coachId: E2E_IDS.coachProfile,
        clientId: E2E_IDS.otherClientUser,
        startsAt: START,
        idempotencyKey: "integration-second-key",
        now: NOW,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await prisma.emailOutbox.count()).toBe(1);
  });

  it("replays idempotency, cancels, enqueues email and releases the slot", async () => {
    const input = {
      coachId: E2E_IDS.coachProfile,
      clientId: E2E_IDS.clientUser,
      startsAt: START,
      idempotencyKey: "integration-replay-key",
      now: NOW,
    };
    const booked = await bookReservation(input);
    expect((await bookReservation(input)).id).toBe(booked.id);
    expect(await prisma.reservation.count()).toBe(1);

    const cancelled = await cancelReservation({
      reservationId: booked.id,
      user: { id: E2E_IDS.clientUser, role: "CLIENT" },
      idempotencyKey: "integration-cancel-key",
      now: NOW,
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(await prisma.emailOutbox.count()).toBe(2);
    const slots = await listCoachSlots(E2E_IDS.coachProfile, NOW);
    expect(slots.some((slot) => slot.startsAt === START)).toBe(true);
  });
});
