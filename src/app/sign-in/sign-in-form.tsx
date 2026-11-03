"use client";

import { useActionState } from "react";
import { requestMagicLink, type SignInState } from "./actions";

const initialState: SignInState = {};

/** Email form with accessible pending and error states. */
export function SignInForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);
  const error = state.error ?? initialError;

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "sign-in-error" : undefined}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-60"
        />
      </div>

      {/* Live region so screen readers announce errors as they appear. */}
      <p id="sign-in-error" role="alert" className="min-h-5 text-sm text-red-700">
        {error}
      </p>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
