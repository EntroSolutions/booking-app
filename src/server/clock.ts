const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Whether the explicitly enabled, loopback-only end-to-end harness is active.
 * Keeping this check in one place prevents test routes or clock overrides from
 * accidentally becoming production backdoors.
 */
export function isE2eHarnessEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.E2E_TESTING !== "1" || (env.E2E_SECRET?.length ?? 0) < 32) {
    return false;
  }

  try {
    const hostname = new URL(
      env.APP_URL ?? "http://localhost:3000",
    ).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

/**
 * The single server-side clock used by scheduling and reservation mutations.
 * Tests pin E2E_NOW; normal requests always use the system clock. The browser
 * clock and time zone are pinned separately in playwright.config.ts.
 */
export function serverNow(
  env: Record<string, string | undefined> = process.env,
): Date {
  if (isE2eHarnessEnabled(env) && env.E2E_NOW) {
    const value = env.E2E_NOW;
    if (ISO_WITH_ZONE.test(value) && !Number.isNaN(Date.parse(value))) {
      return new Date(value);
    }
  }
  return new Date();
}
