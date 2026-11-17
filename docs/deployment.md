# Deployment & Operations Guide

This document describes how the Booking App is deployed to production and
staging on **Vercel** with **Neon** managed PostgreSQL, and how to release,
roll back, back up, and verify each environment.

## 1. Platform topology (cost-conscious)

| Component  | Service                                   | Tier guidance |
| ---------- | ----------------------------------------- | ------------- |
| Web app    | Vercel (Next.js, `iad1` region)           | Hobby for staging, Pro if team features needed |
| Database   | Neon (single region, us-east-1/iad1)      | Free tier for staging; Scale plan for production |
| Email      | Resend                                    | Free tier (3k emails/mo) is sufficient at launch |
| Scheduled jobs | Vercel Cron (`*/10 * * * *`)          | Included; no separate worker to pay for |

The app in `vercel.json` is pinned to one region so application and database
share a datacenter — the single biggest free/low-cost lever for serverless
latency and function duration.

### Why pooled + direct database URLs

Serverless functions open many short-lived connections. Neon's transaction-mode
PgBouncer pooler absorbs that burst, so the **runtime** uses
`DATABASE_URL_POOLED` (with `pgbouncer=true`). Migrations and Prisma CLI
commands open long-lived DDL sessions that transaction pooling cannot support,
so they use the **direct** `DIRECT_DATABASE_URL`.

## 2. One-time setup

### Database (Neon)

1. Create a Neon project; note the region (keep it near `iad1`).
2. Copy two connection strings from **Connection Details**:
   - *Pooled connection* → `DATABASE_URL_POOLED`
   - Direct (toggle "Pooled connection" off) → `DIRECT_DATABASE_URL`
3. Append `?sslmode=require` to both if not present.

### Email domain (Resend)

1. In Resend → **Domains → Add domain**, add `yourdomain.com`.
2. Add the DKIM/SPF DNS records Resend shows you (see §4).
3. Verify the domain, then set `EMAIL_FROM=Bookings <no-reply@yourdomain.com>`.
4. Suppresses spam folders: keep the from-domain the same as your app domain.

### Environment variables (Vercel)

Set these in **Project → Settings → Environment Variables** for both the
*Production* and *Preview* environments (values may differ per environment):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Pooled Neon URL (with `pgbouncer=true&sslmode=require`). The runtime uses this. |
| `DIRECT_DATABASE_URL` | Direct Neon URL. Used only by migration jobs. |
| `AUTH_SECRET` | `openssl rand -base64 32`. Rotating it signs everyone out. |
| `AUTH_URL` | Same as `APP_URL` (e.g. `https://staging.yourdomain.com`). |
| `APP_URL` | Public base URL; magic-link and callback validation depend on it. |
| `COACH_EMAILS` | Comma-separated coach allowlist for role assignment. |
| `RESEND_API_KEY` | Resend API key (`re_…`). |
| `EMAIL_FROM` | Verified from address. |
| `CRON_SECRET` | `openssl rand -base64 32`; ≥32 chars. Sent as `Authorization: Bearer …` by Vercel Cron and by smoke checks. |

Never commit real values; `.env.example` documents the shape.

## 3. Releasing

### Staging release

```bash
# 1. Create a Neon branch (free) or separate database for staging, then:
vercel link                      # once per machine
vercel env pull .env.staging     # sync values locally if needed

# 2. Run migrations against the staging database exactly once:
DATABASE_URL="$DIRECT_DATABASE_URL" npm run db:migrate:prod

# 3. Deploy the branch/preview and promote, or deploy directly:
vercel --target production       # after merging to main
```

### Production release

```bash
# Merge to main triggers an automatic Vercel build from the connected repo.
# Migrations run separately — see below.

# Run migrations once against production (from CI or an operator machine):
ALLOW_MIGRATE=yes \
  DATABASE_URL="$DIRECT_DATABASE_URL" \
  npm run db:migrate:prod

# Confirm migration status:
npx prisma migrate status
```

### Build & migrations — key design points

- `prisma generate` runs in the normal build (`npm run build`); it is
  connection-free and safe to run in every build instance.
- Migrations are **never** run from serverless request handling. They run once
  per release via `scripts/deploy-migrate.mjs` (wraps
  `prisma migrate deploy`), which is idempotent: already-applied migrations are
  skipped, so re-running or concurrent CI races converge to the same state.
- The script refuses to run against unrecognized hosts unless
  `ALLOW_MIGRATE=yes` or `MIGRATE_ALLOWED_HOSTS` is set — a guardrail against
  running migrations against the wrong database from CI.

## 4. DNS

- App custom domain: add `yourdomain.com` (and `www` → apex CNAME/ALIAS) in
  Vercel → **Domains**. HTTPS certificates are provisioned automatically.
- Email domain: add the DKIM/SPF records from Resend at the same DNS provider.
  Wait for both to show *verified* before announcing sign-up.

## 5. Cron authentication

`vercel.json` schedules `GET /api/jobs/email-outbox` every 10 minutes.
The route authenticates using `CRON_SECRET`:

- Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`.
- Manual invocation: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/email-outbox`
- The route returns **503/401** when the secret is missing/mismatched — it is
  never callable anonymously, even if `CRON_SECRET` is unset.

The older `POST /api/jobs/email` (manual trigger, `EMAIL_JOB_SECRET`) is kept
for operators; Vercel Cron uses the new GET route.

## 6. Backups

- **Managed:** Neon retains point-in-time recovery (PITR) history on paid
  plans (7 days on Launch, 30 days on Scale). Verify the retention window in
  Neon → Backups and record it in your runbook.
- **Supplemental (recommended, free):** scheduled logical dumps.

```bash
# Run from CI or a machine with the DIRECT url; store the dump in object storage.
pg_dump "$DIRECT_DATABASE_URL" --no-owner --format=custom \
  --file "booking-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Restore drill (staging only):
pg_restore --clean --if-exists --dbname "$STAGING_DATABASE_URL" booking-<ts>.dump
```

Test a restore at least quarterly; a backup you have not restored is not a
backup.

## 7. Monitoring hooks

- `GET /api/health` — readiness probe; checks app + database (`SELECT 1`).
  Wire it to an uptime monitor (Better Stack, Checkly, GitHub Actions cron).
- Server logs: `vercel logs <deployment> --follow` or the Vercel dashboard
  Observability tab. Error paths log stable classification codes (e.g.
  `outbox_run_failed`, `DELIVERY_FAILED`) without PII or provider payloads.
- Alert on: health endpoint failures, `EMAIL_JOB_SECRET`-authenticated outbox
  endpoint reporting `failed > 0` repeatedly, and any 5xx spike.
- Outbox backlog: query
  `select status, count(*) from "EmailOutbox" group by 1;` — a growing
  `PENDING` count means the cron is not running.

## 8. Rollback procedure

### Application rollback

```bash
# Instant, database-safe: redeploy the previous immutable build.
vercel ls                        # find previous deployment
vercel promote <previous-deployment-url>
```

Application rollbacks never require schema changes because Prisma migrations
are additive; a previous build keeps working with newer schema.

### Schema rollback

There is no automatic down-migration. Procedure:

1. `promote` the previous application deployment first (stop new writes to the
   new schema).
2. Inspect `prisma/migrations/<bad>/migration.sql` and write an explicit
   reverse migration (e.g. drop an added column). Prefer leaving additive
   changes in place and removing them in a later migration.
3. Apply with `DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy`
   and verify with `npx prisma migrate status`.
4. If data was written with the new schema, restore from the most recent
   `pg_dump` taken **before** the release (§6) — that is why pre-release
   backups matter.

### Secret/cookie incidents

Rotating `AUTH_SECRET` invalidates sessions (users sign in again) — use it to
force logout after a suspected compromise.

## 9. Post-deploy smoke checks

Run `node scripts/smoke-check.mjs https://<host>` (exit code 1 on failure) or
follow this manual checklist:

| # | Check | Expected |
| --- | --- | --- |
| 1 | `GET /` | 200, CSP/HSTS/nosniff headers present |
| 2 | `GET /sign-in` | 200; submit an email → magic-link email arrives from the verified domain |
| 3 | Sign in via magic link | Redirect to `/coach` or `/client`; session cookie `Secure`/`HttpOnly` |
| 4 | Coach: update weekly availability | Saved; reflected in slot generation |
| 5 | `GET /api/coaches/<coachId>/slots?from&to` | 200 with JSON list of generated slots, correct DST offsets |
| 6 | Book a slot (client) | Reservation created; confirmation email queued & delivered |
| 7 | Double-book same slot (second tab / curl) | Second attempt fails with a conflict, not a 500 |
| 8 | Cancel reservation | Status → `CANCELLED`; cancellation emails sent |
| 9 | `POST /api/reservations` unauthenticated | 401, no stack trace or provider details in body |
| 10 | `GET /api/jobs/email-outbox` without secret | 401 (503 only if CRON_SECRET unset) |
| 11 | `GET /api/jobs/email-outbox` with secret | 200 `{ok:true, sent:n}` |
| 12 | `GET /api/health` | 200 `{"status":"ok","checks":{"database":"ok"}}` |
| 13 | Cron run observed in logs | No repeated `DELIVERY_FAILED`; Resend dashboard shows delivered emails |

Automated checks 1–3, 5, 9, 10–12 are covered by `npm run smoke`.
