// Server-side authorization helpers. These are the source of truth for access
// control: call them from layouts/pages (redirect mode) and from every server
// action or route handler (throw mode). Never rely on hiding UI.
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  authorize,
  type AppRole,
  type AuthFailureReason,
  type SessionUser,
} from "@/lib/auth/roles";

/** Typed error thrown in `onFail: "throw"` mode (server actions, APIs). */
export class AuthorizationError extends Error {
  readonly code: AuthFailureReason;
  /** HTTP-equivalent status: 401 for unauthenticated, 403 for forbidden. */
  readonly status: 401 | 403;

  constructor(code: AuthFailureReason) {
    super(code === "UNAUTHENTICATED" ? "Sign in required" : "Access denied");
    this.name = "AuthorizationError";
    this.code = code;
    this.status = code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export type GuardOptions = {
  /**
   * `redirect` (default): send the user to sign-in / their home page. Use in
   * layouts and pages. `throw`: raise an AuthorizationError. Use in server
   * actions and route handlers so callers can return a typed error.
   */
  onFail?: "redirect" | "throw";
  /** Local path to return to after signing in (redirect mode only). */
  callbackPath?: string;
};

/** Where forbidden (signed in, wrong role) users are sent in redirect mode. */
const FORBIDDEN_REDIRECT = "/dashboard";

/** Current user from the session, or null when signed out. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
  };
}

async function requireRoles(
  allowedRoles: readonly AppRole[] | undefined,
  { onFail = "redirect", callbackPath }: GuardOptions = {},
): Promise<SessionUser> {
  const result = authorize(await getCurrentUser(), allowedRoles);
  if (result.ok) return result.user;

  if (onFail === "throw") throw new AuthorizationError(result.reason);

  if (result.reason === "UNAUTHENTICATED") {
    const query = callbackPath
      ? `?callbackUrl=${encodeURIComponent(callbackPath)}`
      : "";
    redirect(`/sign-in${query}`);
  }
  redirect(FORBIDDEN_REDIRECT);
}

/** Any signed-in user. */
export function requireUser(options?: GuardOptions): Promise<SessionUser> {
  return requireRoles(undefined, options);
}

/** Signed-in user with the COACH role. */
export function requireCoach(options?: GuardOptions): Promise<SessionUser> {
  return requireRoles(["COACH"], options);
}

/** Signed-in user with the CLIENT role. */
export function requireClient(options?: GuardOptions): Promise<SessionUser> {
  return requireRoles(["CLIENT"], options);
}
