# Booking App

A booking app for independent coaches. Clients can browse available sessions, pick a time, and manage their reservations. Coaches control their weekly availability.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [PostgreSQL](https://www.postgresql.org/) via [Prisma ORM](https://www.prisma.io/)
- ESLint, Prettier, Vitest + React Testing Library

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example env file and fill in the values:

```bash
cp .env.example .env
```

| Variable         | Description                                    |
| ---------------- | ---------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string used by Prisma    |
| `AUTH_SECRET`    | Secret used by Auth.js (server-only)           |
| `AUTH_URL`       | Canonical URL for magic links; same as `APP_URL` |
| `COACH_EMAILS`   | Comma-separated emails that sign up as coaches |
| `RESEND_API_KEY` | Resend API key for sending transactional email (optional locally) |
| `EMAIL_FROM`     | From address for outgoing emails               |
| `APP_URL`        | Public base URL of the app; callback URLs are validated against it |

### 3. Start PostgreSQL

A Docker Compose file is provided for local development:

```bash
npm run db:up
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication and roles

Sign-in uses [Auth.js](https://authjs.dev/) with passwordless email magic links,
Prisma-persisted database sessions, and server-side role checks.

- Pages: `/sign-in`, `/sign-in/check-email`, `/sign-out`. `/dashboard` routes
  users to `/coach` or `/client` based on their role.
- Roles: new accounts are `CLIENT`. Emails listed in `COACH_EMAILS` become
  `COACH` the first time they sign in. Roles are never taken from user input.
  Change an existing user's role directly in the database (e.g. Prisma Studio).
- Session exposes only `id`, `email`, `name` and `role`.
- Callback URLs are reduced to same-origin paths and checked against `APP_URL`.

### Protecting routes and server actions

Use the guards in `src/server/auth/guards.ts`; UI hiding is never sufficient.

```ts
// Layouts/pages: redirects to /sign-in (signed out) or /dashboard (wrong role)
await requireCoach({ callbackPath: "/coach" });

// Server actions/route handlers: throws AuthorizationError (401 / 403)
const user = await requireClient({ onFail: "throw" });
```

Layouts under `src/app/(dashboard)/coach` and `/client` enforce these on the server.
Every server action must still call a guard itself, as actions can be invoked directly.

### Local email development

If `RESEND_API_KEY` is empty and `NODE_ENV` is not `production`, no email is sent.
The magic link is printed to the terminal running `npm run dev`; open it in the
browser to sign in. In production a missing key makes sign-in fail instead of logging links.
Run `npm run db:migrate` after pulling to create the auth tables.

## Scripts

| Script                 | Description                            |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Start the development server           |
| `npm run build`        | Production build (runs `prisma generate`) |
| `npm start`            | Start the production server            |
| `npm run lint`         | Run ESLint                             |
| `npm run typecheck`    | Run TypeScript type checking           |
| `npm test`             | Run unit tests (Vitest)                |
| `npm run test:watch`   | Run tests in watch mode                |
| `npm run db:up`        | Start the local PostgreSQL container   |
| `npm run db:down`      | Stop the local PostgreSQL container    |
| `npm run db:migrate`   | Run Prisma migrations in dev mode      |
| `npm run db:push`      | Push schema to the database            |
| `npm run db:studio`    | Open Prisma Studio                     |

## Project structure

```
src/
├── app/           # Next.js App Router routes
├── components/    # Reusable UI components
├── server/        # Server-side utilities (db, auth, email)
├── lib/
│   └── validations/ # Zod validation schemas
└── tests/         # Unit and component tests
```

## Formatting

```bash
npx prettier --write .
```
