#!/usr/bin/env node
/**
 * Production/staging release helper.
 *
 * Usage:
 *   node scripts/deploy-migrate.mjs            # migrate, then print status
 *
 * Design goals:
 * - Runs migrations exactly once per release, not once per serverless instance.
 *   Call this from CI (GitHub Actions) or your own machine with the DIRECT url.
 * - Uses the *direct* (non-pooled) database URL: migrations hold DDL locks that
 *   PgBouncer transaction pooling does not tolerate.
 * - Fail-safe: refuses to run when DATABASE_URL points at an unexpected host
 *   unless ALLOW_MIGRATE=yes is set (protects against CI misconfiguration).
 */
import { spawnSync } from "node:child_process";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const directUrl = process.env.DIRECT_DATABASE_URL || required("DATABASE_URL");

// Guards against accidentally migrating the wrong environment from CI.
const knownHosts = (process.env.MIGRATE_ALLOWED_HOSTS || "localhost,127.0.0.1,neon.tech,aws.neon.build,render.com,supabase.co,aws-0-us-east-1.pooler.supabase.com,rds.amazonaws.com").split(",");
if (process.env.ALLOW_MIGRATE !== "yes") {
  let host;
  try {
    host = new URL(directUrl).hostname;
  } catch {
    console.error("Could not parse database URL host");
    process.exit(1);
  }
  const allowed = knownHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) {
    console.error(
      `Refusing to migrate host "${host}". Set MIGRATE_ALLOWED_HOSTS or ALLOW_MIGRATE=yes if this is intended.`,
    );
    process.exit(1);
  }
}

console.log("Running prisma migrate deploy against the direct database URL…");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: directUrl },
});
if (result.status !== 0) {
  console.error("Migration failed. Do NOT proceed with the release.");
  console.error("Rollback guidance: see docs/deployment.md — 'Rolling back a release'.");
  process.exit(result.status ?? 1);
}

console.log("Migration complete.");
spawnSync("npx", ["prisma", "migrate", "status"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: directUrl } });
