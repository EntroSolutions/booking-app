import Link from "next/link";
import { requireClient } from "@/server/auth/guards";

export default async function ClientDashboardPage() {
  const user = await requireClient({ callbackPath: "/client" });
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Your reservations</h1>
      <p className="mt-2 text-gray-600">Signed in as {user.email}.</p>
      <Link href="/sign-out" className="mt-4 inline-block underline">
        Sign out
      </Link>
    </main>
  );
}
