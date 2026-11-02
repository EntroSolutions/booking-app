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
| `AUTH_SECRET`    | Secret used for signing auth sessions          |
| `RESEND_API_KEY` | Resend API key for sending transactional email |
| `EMAIL_FROM`     | From address for outgoing emails               |
| `APP_URL`        | Public base URL of the app                     |

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
