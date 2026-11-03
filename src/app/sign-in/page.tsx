import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in | Booking App" };

// Auth.js appends ?error=<code> when a magic link fails or is reused.
const ERROR_MESSAGES: Record<string, string> = {
  Verification: "That sign-in link is invalid or has expired. Request a new one.",
  AccessDenied: "You do not have access to sign in.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const safeCallback = safeCallbackPath(callbackUrl, appUrl);

  // Already signed in: skip the form.
  if (await getCurrentUser()) redirect(safeCallback);

  const initialError = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong signing you in. Please try again.")
    : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter your email and we will send you a one-time sign-in link.
      </p>
      <SignInForm callbackUrl={safeCallback} initialError={initialError} />
    </main>
  );
}
