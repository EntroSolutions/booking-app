import Link from "next/link";

/**
 * Public landing page for the Booking App.
 *
 * Marketing page that explains the service for clients and coaches, and links
 * to the coach directory, sign-in, and dashboard flows.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <span className="text-xl font-bold">Booking App</span>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/coaches" className="text-gray-700 hover:text-black">
            Browse coaches
          </Link>
          <Link href="/sign-in" className="text-gray-700 hover:text-black">
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
          >
            My dashboard
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center gap-6 px-8 py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-bold leading-tight">
          Book time with independent coaches — without the email tennis
        </h1>
        <p className="max-w-xl text-lg text-gray-600">
          Browse available sessions, pick a time that works in your own time
          zone, and manage your reservations. Coaches set their weekly
          availability once; the calendar keeps everything else in sync.
        </p>
        <div className="flex gap-4">
          <Link
            href="/coaches"
            className="rounded bg-black px-6 py-3 text-white hover:bg-gray-800"
          >
            Find a coach
          </Link>
          <Link
            href="/sign-in"
            className="rounded border border-black px-6 py-3 text-black hover:bg-gray-100"
          >
            Coach? Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-8 px-8 py-16 sm:grid-cols-3">
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-semibold">Coach availability calendars</h2>
          <p className="mt-2 text-sm text-gray-600">
            Coaches control weekly recurring hours, session length, and
            date-specific closures. Time zones and daylight saving are handled
            automatically.
          </p>
        </div>
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-semibold">Book and cancel in seconds</h2>
          <p className="mt-2 text-sm text-gray-600">
            Clients see real, bookable slots — no double bookings, no stale
            times. Reservations can be canceled from the dashboard up to the
            coach&apos;s cutoff.
          </p>
        </div>
        <div className="rounded-lg border p-6">
          <h2 className="text-lg font-semibold">Email confirmations</h2>
          <p className="mt-2 text-sm text-gray-600">
            Every booking and cancellation sends a confirmation email with the
            session time, time zone, and participants.
          </p>
        </div>
      </section>

      {/* Call to action */}
      <section className="flex flex-col items-center gap-4 px-8 py-16 text-center">
        <h2 className="text-3xl font-bold">Ready to get started?</h2>
        <p className="max-w-md text-gray-600">
          Sign in with your email and you&apos;ll be booking (or coaching) in
          no time.
        </p>
        <Link
          href="/sign-in"
          className="rounded bg-black px-6 py-3 text-white hover:bg-gray-800"
        >
          Sign in
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-auto flex flex-col items-center gap-2 border-t px-8 py-6 text-sm text-gray-500">
        <p>
          Plan your coaching sessions with{" "}
          <a
            href="https://vibecoderplanner.com/"
            className="underline hover:text-black"
            rel="noopener noreferrer"
            target="_blank"
          >
            VibeCoder Planner
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
