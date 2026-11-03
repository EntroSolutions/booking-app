"use client";

import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function SignOutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-6">
      <SubmitButton />
    </form>
  );
}
