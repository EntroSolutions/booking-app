export const metadata = { title: "Check your email | Booking App" };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="mt-2 text-sm text-gray-600" role="status">
        If that address can sign in, a link is on its way. It expires in 15 minutes and
        can only be used once.
      </p>
      <p className="mt-4 text-sm text-gray-600">
        Developing locally without an email provider key? The link is printed in the
        terminal running <code>npm run dev</code>.
      </p>
    </main>
  );
}
