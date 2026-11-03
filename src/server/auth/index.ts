// Auth.js (NextAuth v5) configuration: email magic links, Prisma-persisted
// database sessions, and a session that exposes only { id, email, name, role }.
//
// Server-only: this module reads AUTH_SECRET (consumed by Auth.js from the
// environment) and uses Prisma. Never import it from a client component.
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { resolveRedirectUrl } from "@/lib/auth/redirect";
import {
  isAppRole,
  parseEmailList,
  resolveInitialRole,
} from "@/lib/auth/roles";
import { sendMagicLink } from "./email";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

// Magic-link URLs are built from the request host; pin it to APP_URL so a
// spoofed Host header can't produce links pointing at another origin.
process.env.AUTH_URL ??= appUrl;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // extend at most once a day
  },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
    // Errors are rendered by the sign-in page via ?error=<code>.
    error: "/sign-in",
  },
  providers: [
    Resend({
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60, // magic links are valid for 15 minutes
      sendVerificationRequest: ({ identifier, url, provider, expires }) =>
        sendMagicLink({ identifier, url, from: provider.from, expires }),
    }),
  ],
  callbacks: {
    // Only ever redirect to the APP_URL origin.
    redirect: ({ url }) => resolveRedirectUrl(url, appUrl),
    // Build the session explicitly from an allowlist of fields so nothing
    // else on the database user (e.g. emailVerified) leaks to the client.
    session: ({ session, user }) => {
      // The Prisma adapter returns the full User row, including `role`.
      const role = (user as { role?: unknown }).role;
      return {
        expires: session.expires,
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: isAppRole(role) ? role : "CLIENT",
        },
      };
    },
  },
  events: {
    // Roles come from the server-side COACH_EMAILS allowlist, never from input.
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const role = resolveInitialRole(
        user.email,
        parseEmailList(process.env.COACH_EMAILS),
      );
      if (role !== "CLIENT") {
        await prisma.user.update({ where: { id: user.id }, data: { role } });
      }
    },
  },
});
