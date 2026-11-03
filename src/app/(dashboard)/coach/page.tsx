import Link from "next/link";
import { requireCoach } from "@/server/auth/guards";

export default async function CoachDashboardPage() {
  const user = await requireCoach({ callbackPath: "/coach" });
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Coach dashboard</h1>
      <p className="mt-2 text-gray-600">Signed in as {user.email}.</p>
      <Link href="/sign-out" className="mt-4 inline-block underline">
        Sign out
      </Link>
    </main>
  );
}
