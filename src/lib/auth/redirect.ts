// Callback/redirect URL validation. Pure functions (no Next/Auth.js imports)
// so they can be unit tested and shared by the Auth.js config and server actions.

/** Where users land after signing in when no (valid) callback is supplied. */
export const DEFAULT_CALLBACK_PATH = "/dashboard";

/**
 * Reduce an untrusted callback value to a same-origin path (`/path?query#hash`).
 *
 * Anything that is not a plain path or an absolute URL on the `appUrl` origin
 * (other hosts, protocol-relative `//evil.com`, backslash tricks, `javascript:`
 * URLs, control characters) falls back to `fallback`. This prevents open
 * redirects after sign-in.
 */
export function safeCallbackPath(
  raw: unknown,
  appUrl: string,
  fallback: string = DEFAULT_CALLBACK_PATH,
): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return fallback;
  }
  // Reject backslashes and control characters that browsers may normalise
  // into a different host (e.g. "/\evil.com").
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let base: URL;
  let target: URL;
  try {
    base = new URL(appUrl);
    target = new URL(raw, base);
  } catch {
    return fallback;
  }

  if (target.origin !== base.origin) return fallback;
  return `${target.pathname}${target.search}${target.hash}`;
}

/**
 * Auth.js `redirect` callback logic: always resolve to an absolute URL on the
 * configured `APP_URL` origin.
 */
export function resolveRedirectUrl(url: string, appUrl: string): string {
  const path = safeCallbackPath(url, appUrl, DEFAULT_CALLBACK_PATH);
  return new URL(path, appUrl).toString();
}
