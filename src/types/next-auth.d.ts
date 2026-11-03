import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/auth/roles";

// Expose only the id and role on the session user (no tokens or timestamps).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
    } & DefaultSession["user"];
  }
}
