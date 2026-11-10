"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { signInSchema } from "@/lib/validations";
import { assertCsrfHeaders } from "@/server/http/csrf";
import { clientIp, enforceRateLimit } from "@/server/rate-limit";

export type SignInState = { error?: string };

/** Request a magic link. On success Auth.js redirects to check-email. */
export async function requestMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const requestHeaders = await headers();
  assertCsrfHeaders(requestHeaders);
  await enforceRateLimit("auth", clientIp(requestHeaders));

  const parsed = signInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const redirectTo = safeCallbackPath(formData.get("callbackUrl"), appUrl);
  try {
    await signIn("resend", { email: parsed.data.email, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "We could not send the sign-in link. Please try again." };
    }
    // NEXT_REDIRECT is control flow, not an operational failure.
    throw error;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  assertCsrfHeaders(await headers());
  await signOut({ redirectTo: "/" });
}
