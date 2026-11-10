import Link from "next/link";
import { prisma } from "@/server/db";

export default async function CoachesPage() {
  const coaches = await prisma.coachProfile.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold">Find a coach</h1>
      <p className="mt-2 text-gray-600">
        Browse available sessions and choose a time that works for you.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {coaches.map((coach) => (
          <li key={coach.id} className="rounded border p-5">
            <h2 className="text-xl font-semibold">
              {coach.user.name ?? "Independent coach"}
            </h2>
            <p className="mt-2 text-sm text-gray-600">{coach.bio}</p>
            <p className="mt-2 text-sm">
              {coach.sessionDurationMinutes} minutes · {coach.timezone}
            </p>
            <Link
              href={`/coaches/${coach.id}`}
              className="mt-4 inline-block underline"
            >
              View available sessions
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
