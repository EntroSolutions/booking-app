// Seed script: one coach, one client, recurring weekly availability and
// representative reservations.
//
// Usage: npm run db:seed   (runs after `prisma generate` + `db:migrate`)
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Concrete instants are written as UTC ISO strings. The coach works in
// Europe/Berlin; 09:00 local (CET, UTC+1) === 08:00 UTC in winter.
const utc = (iso) => new Date(iso);

async function main() {
  const coachUser = await prisma.user.upsert({
    where: { email: "coach@example.com" },
    update: {},
    create: {
      email: "coach@example.com",
      name: "Alex Coach",
      role: "COACH",
      coachProfile: {
        create: { timezone: "Europe/Berlin", bio: "Career & leadership coaching" },
      },
    },
  });

  const clientUser = await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: { email: "client@example.com", name: "Sam Client", role: "CLIENT" },
  });

  const coach = await prisma.coachProfile.findUniqueOrThrow({
    where: { userId: coachUser.id },
  });

  // Recurring availability: Mon–Fri 09:00–17:00 local wall clock, lunch break out.
  const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  await prisma.weeklyAvailability.createMany({
    data: weekdays.flatMap((weekday) => [
      { coachId: coach.id, weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
      { coachId: coach.id, weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
    ]),
    skipDuplicates: true,
  });

  // One day off.
  await prisma.availabilityException.upsert({
    where: {
      coachId_date_startMinute: { coachId: coach.id, date: new Date("2026-02-16"), startMinute: null },
    },
    update: {},
    create: {
      coachId: coach.id,
      date: new Date("2026-02-16"),
      isUnavailable: true,
      reason: "Public holiday",
    },
  });

  // Representative reservations: confirmed, pending, and a cancelled one
  // (kept for booking history). The cancelled slot overlaps the confirmed
  // one on purpose to demonstrate that the exclusion constraint only guards
  // *active* reservations.
  const reservations = [
    {
      startsAt: utc("2026-02-17T08:00:00Z"),
      endsAt: utc("2026-02-17T09:00:00Z"),
      status: "CONFIRMED",
    },
    {
      startsAt: utc("2026-02-18T14:00:00Z"),
      endsAt: utc("2026-02-18T15:00:00Z"),
      status: "PENDING",
    },
    {
      startsAt: utc("2026-02-17T08:00:00Z"),
      endsAt: utc("2026-02-17T09:00:00Z"),
      status: "CANCELLED",
      cancelledAt: utc("2026-02-10T10:00:00Z"),
      cancelReason: "Client rescheduled",
    },
  ];

  for (const r of reservations) {
    const existing = await prisma.reservation.findFirst({
      where: { coachId: coach.id, clientId: clientUser.id, startsAt: r.startsAt },
    });
    if (existing) continue;
    await prisma.reservation.create({
      data: { coachId: coach.id, clientId: clientUser.id, ...r },
    });
  }

  console.log("Seed complete: 1 coach, 1 client, availability and reservations created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
