# Booking Data Model

## Overview

```
User (role: CLIENT | COACH | ADMIN)
 └─ CoachProfile (1:1, timezone, bio)
     ├─ WeeklyAvailability[]   — recurring wall-clock windows per weekday
     ├─ AvailabilityException[]— per-date overrides (day off / extra window)
     └─ Reservation[]          — concrete bookings
User (CLIENT) ── Reservation[]
```

## Key decisions

### Time zones
- **Weekly availability** is stored as minutes-from-local-midnight
  (`startMinute` / `endMinute`, 0–1440) on a `Weekday`, interpreted in the
  IANA time zone stored on `CoachProfile`. Wall-clock rules survive DST
  transitions unchanged ("09:00 local" stays 09:00 all year).
- **Reservations** store absolute instants as `timestamptz`
  (PostgreSQL stores UTC internally). Concrete slot instants are computed by
  resolving the wall-clock window through the coach's zone at booking time.

### Integrity enforced by the database
- Enums (`Role`, `Weekday`, `ReservationStatus`) reject invalid values.
- CHECK constraints: availability windows must satisfy
  `0 <= start < end <= 1440`; reservations must have `starts_at < ends_at`.
- `onDelete: Cascade` from coach profile to its availability rules;
  reservations use `RESTRICT` so history cannot be silently destroyed.
- Reservations are never hard-deleted; cancellation sets
  `status = CANCELLED`, `cancelledAt`, and `cancelReason`.

### Double-booking prevention
A PostgreSQL **exclusion constraint** (requires the `btree_gist` extension):

```sql
ALTER TABLE reservations ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING gist (
    coach_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'));
```

Only *active* reservations (`PENDING`, `CONFIRMED`) participate, so cancelled
and completed history never blocks future bookings. Because the constraint is
evaluated at commit time by PostgreSQL, two concurrent booking requests for
the same slot cannot both succeed regardless of application logic. Inserts
should run in a transaction (Prisma `$transaction`); on conflict, catch the
PostgreSQL error code `23P01` (`exclusion_violation`) and surface a friendly
"slot no longer available" message.

### Indexes for schedule queries
- `weekly_availability(coach_id, weekday)` — building a coach's week view.
- `availability_exceptions(coach_id, date)` — resolving exceptions for a date.
- `reservations(coach_id, starts_at)` — coach schedule / busy-slot lookups.
- `reservations(client_id, starts_at)` — client "my bookings" queries.
- Unique slot guard on `(coach_id, weekday, start_minute)` prevents duplicate
  recurring windows.

## Commands

```bash
npm run db:up        # start Postgres (docker compose)
npm run db:migrate   # apply migrations in dev
npm run db:seed      # seed demo data (prisma/seed.js)
```
