import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">Booking App</h1>
      <p className="mt-4 text-lg text-gray-600">
        Browse sessions, pick a time, and manage your reservations.
      </p>
      <Link href="/coaches" className="mt-6 rounded bg-black px-4 py-2 text-white">
        Browse coaches
      </Link>
    </main>
  );
}
