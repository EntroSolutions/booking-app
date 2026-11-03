// Role helpers shared by server guards and UI. Pure and framework-free.

export const ROLES = ["CLIENT", "COACH", "ADMIN"] as const;

/** Mirrors the Prisma `Role` enum without importing the generated client. */
export type AppRole = (typeof ROLES)[number];

/** Minimal, non-sensitive user shape exposed to the app via the session. */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
};

export type AuthFailureReason = "UNAUTHENTICATED" | "FORBIDDEN";

export type AuthorizationResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: AuthFailureReason };

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Decide whether `user` may proceed given the allowed roles.
 * A missing user (or one with an unknown role) is unauthenticated; a known
 * user with the wrong role is forbidden.
 */
export function authorize(
  user: SessionUser | null | undefined,
  allowedRoles?: readonly AppRole[],
): AuthorizationResult {
  if (!user || !user.id || !isAppRole(user.role)) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  return { ok: true, user };
}

/** Parse a comma-separated email list (e.g. `COACH_EMAILS`) into a lowercase set. */
export function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Role assigned to a brand-new account. Everyone starts as CLIENT; emails on
 * the server-side allowlist become COACH. Roles are never taken from user input.
 */
export function resolveInitialRole(
  email: string,
  coachEmails: ReadonlySet<string>,
): AppRole {
  return coachEmails.has(email.trim().toLowerCase()) ? "COACH" : "CLIENT";
}

/** Home route for each role, used to route users after sign-in. */
export function homePathForRole(role: AppRole): string {
  switch (role) {
    case "COACH":
      return "/coach";
    case "CLIENT":
      return "/client";
    default:
      return "/";
  }
}
