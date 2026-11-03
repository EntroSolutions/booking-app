import { signOutAction } from "@/app/sign-in/actions";
import { SignOutForm } from "./sign-out-button";

export const metadata = { title: "Sign out | Booking App" };

export default function SignOutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="text-2xl font-bold">Sign out</h1>
      <p className="mt-2 text-sm text-gray-600">Do you want to sign out of Booking App?</p>
      <SignOutForm action={signOutAction} />
    </main>
  );
}
