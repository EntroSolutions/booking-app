"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { signInSchema } from "@/lib/validations";

export type SignInState = { error?: string };

/** Request a magic link. On success Auth.js redirects to the check-email page. */
export async function requestMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  // Validate the callback against APP_URL; never trust the form value.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const redirectTo = safeCallbackPath(formData.get("callbackUrl"), appUrl);

  try {
    await signIn("resend", { email: parsed.data.email, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "We could not send the sign-in link. Please try again." };
    }
    // Re-throw redirects (NEXT_REDIRECT) and unexpected errors.
    throw error;
  }
  return {};
}

/** End the current session and return to the home page. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
