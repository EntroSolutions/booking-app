import { requireClient } from "@/server/auth/guards";

// Enforced on the server for every route under /client.
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requireClient({ callbackPath: "/client" });
  return <>{children}</>;
}
