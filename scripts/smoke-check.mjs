#!/usr/bin/env node
/**
 * Post-deploy smoke checks against a deployed (staging or production) URL.
 *
 * Usage:
 *   node scripts/smoke-check.mjs https://staging.example.com
 *   SMOKE_EMAIL=coach@example.com SMOKE_SECRET=... node scripts/smoke-check.mjs https://app
 *
 * Env:
 *   SMOKE_TOKEN   Optional CRON_SECRET; enables authenticated deep checks
 *                 (outbox processor liveness).
 *   SMOKE_COACH   Optional coach id; exercises the public slots endpoint.
 *
 * Exit code is non-zero if any critical check fails.
 */
const base = process.argv[2];
if (!base) {
  console.error("Usage: node scripts/smoke-check.mjs <base-url>");
  process.exit(2);
}
const origin = base.replace(/\/$/, "");
const token = process.env.SMOKE_TOKEN;
const coachId = process.env.SMOKE_COACH;

let failures = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

async function check(name, url, init, expects = [200]) {
  try {
    const res = await fetch(url, { redirect: "manual", ...init });
    const body = await res.text();
    const statusOk = expects.includes(res.status);
    const noLeak = !/database|prisma|stack at|password|api[_-]?key/i.test(body);
    ok(name, statusOk && noLeak, `status=${res.status}`);
    return { res, body };
  } catch (error) {
    ok(name, false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

// 1. Home page renders and headers are present.
{
  const r = await check("home page", `${origin}/`);
  if (r) {
    const h = r.res.headers;
    ok(
      "security headers",
      h.get("x-content-type-options") === "nosniff" &&
        h.get("referrer-policy") === "no-referrer" &&
        h.get("content-security-policy")?.includes("default-src 'self'"),
      "CSP/HSTS/XFO",
    );
    const csp = h.get("content-security-policy") || "";
    ok("HSTS in production", csp.length > 0 ? h.get("strict-transport-security") !== null : false);
  }
}

// 2. Sign-in page (magic-link flow entry point).
await check("sign-in page", `${origin}/sign-in`);

// 3. Dashboard is protected.
{
  const r = await check("dashboard redirects unauthenticated users", `${origin}/dashboard`, undefined, [307, 302]);
  if (r) {
    const location = r.res.headers.get("location") || "";
    ok("dashboard redirects to sign-in", location.startsWith("/sign-in"), location);
  }
}

// 4. Public slots endpoint (coach schedule → generated slots).
if (coachId) {
  const from = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const r = await check("coach slots endpoint", `${origin}/api/coaches/${coachId}/slots?from=${from}&to=${to}`);
  if (r) {
    try {
      const json = JSON.parse(r.body);
      ok("slots payload is a list", Array.isArray(json?.slots ?? json), `${(json?.slots ?? json)?.length ?? 0} slots`);
    } catch {
      ok("slots payload is JSON", false, "unparseable body");
    }
  }
}

// 5. Cron job endpoint rejects unauthenticated calls and accepts the secret.
await check("cron job rejects unauthenticated", `${origin}/api/jobs/email-outbox`, undefined, [401, 503]);
if (token) {
  await check("cron job authenticated", `${origin}/api/jobs/email-outbox`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

// 6. Booking API rejects unauthenticated writes.
await check("reservation API rejects unauthenticated POST", `${origin}/api/reservations`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ coachId: coachId ?? "x", slotStart: new Date().toISOString() }),
}, [401, 403]);

// 7. Health endpoint (if configured).
await check("health endpoint", `${origin}/api/health`, undefined, [200, 404]);

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
