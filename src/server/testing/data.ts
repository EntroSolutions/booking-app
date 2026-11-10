import { prisma } from "@/server/db";
import { resetLocalRateLimits } from "@/server/rate-limit";
import { HttpError } from "@/server/http/errors";

export const E2E_IDS = {
  coachUser: "e2e-coach-user",
  coachProfile: "e2e-coach-profile",
  clientUser: "e2e-client-user",
  otherClientUser: "e2e-other-client-user",
} as const;

export const E2E_SESSION_TOKENS = {
  coach: "e2e-coach-session-token",
  client: "e2e-client-session-token",
  otherClient: "e2e-other-client-session-token",
} as const;

function assertSafeDatabase(): void {
  const connection = process.env.DATABASE_URL;
  try {
    const url = new URL(connection ?? "");
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!local && process.env.ALLOW_TEST_DATABASE_RESET !== "1") {
      throw new Error("unsafe host");
    }
  } catch {
    throw new HttpError(
      503,
      "TEST_DATABASE_REQUIRED",
      "A local test database is required.",
    );
  }
}

/** Reset all mutable state and create deterministic coach/client fixtures. */
export async function resetDatabaseForTests(now = new Date("2026-01-05T08:00:00.000Z")) {
  assertSafeDatabase();
  await prisma.$transaction([
    prisma.emailOutbox.deleteMany(),
    prisma.idempotencyRecord.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.availabilityException.deleteMany(),
    prisma.weeklyAvailability.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.coachProfile.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  await prisma.user.create({
    data: {
      id: E2E_IDS.coachUser,
      email: "coach@e2e.test",
      name: "E2E Coach",
      role: "COACH",
      emailVerified: now,
      createdAt: now,
      updatedAt: now,
      coachProfile: {
        create: {
          id: E2E_IDS.coachProfile,
          timezone: "America/New_York",
          bio: "Deterministic test coaching",
          sessionDurationMinutes: 60,
          weeklyAvailability: {
            create: [
              "MONDAY",
              "TUESDAY",
              "WEDNESDAY",
              "THURSDAY",
              "FRIDAY",
            ].map((weekday) => ({
              weekday: weekday as "MONDAY",
              startMinute: 9 * 60,
              endMinute: 12 * 60,
            })),
          },
        },
      },
    },
  });
  await prisma.user.createMany({
    data: [
      {
        id: E2E_IDS.clientUser,
        email: "client@e2e.test",
        name: "E2E Client",
        role: "CLIENT",
        emailVerified: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: E2E_IDS.otherClientUser,
        email: "other-client@e2e.test",
        name: "E2E Other Client",
        role: "CLIENT",
        emailVerified: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  await prisma.session.createMany({
    data: [
      {
        sessionToken: E2E_SESSION_TOKENS.coach,
        userId: E2E_IDS.coachUser,
        expires: new Date("2099-01-01T00:00:00.000Z"),
      },
      {
        sessionToken: E2E_SESSION_TOKENS.client,
        userId: E2E_IDS.clientUser,
        expires: new Date("2099-01-01T00:00:00.000Z"),
      },
      {
        sessionToken: E2E_SESSION_TOKENS.otherClient,
        userId: E2E_IDS.otherClientUser,
        expires: new Date("2099-01-01T00:00:00.000Z"),
      },
    ],
  });
  resetLocalRateLimits();
}
