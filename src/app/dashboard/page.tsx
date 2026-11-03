import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { homePathForRole } from "@/lib/auth/roles";

// Post-sign-in landing: route each user to the dashboard for their role.
export default async function DashboardRedirectPage() {
  const user = await requireUser({ callbackPath: "/dashboard" });
  redirect(homePathForRole(user.role));
}
