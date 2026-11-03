import { requireCoach } from "@/server/auth/guards";

// Enforced on the server for every route under /coach.
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  await requireCoach({ callbackPath: "/coach" });
  return <>{children}</>;
}
