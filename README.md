# Elderflow

Elderflow is a pnpm workspace with a NestJS/PostgreSQL backend and a Vue 3/PrimeVue frontend.

## Repository layout

- `backend/` - NestJS API, TypeORM entities and migrations, PostgreSQL Docker Compose service, and Jest tests
- `frontend/` - Vue 3, Vite, Vue Router, PrimeVue 4, and Vitest tests
- `scripts/` - local development orchestration

## Prerequisites

- Node.js 20 or newer
- pnpm 10.26.1
- Docker with Docker Compose

Install dependencies from the repository root:

```sh
pnpm install
```

## Local development

Start the complete development environment:

```sh
pnpm dev
```

The command creates missing `backend/.env` and `frontend/.env` files from their examples, adds newly introduced example keys to existing local env files, finds a free backend port beginning at 3000, starts PostgreSQL with Docker Compose when it is not reachable, waits for the database, and starts both applications in hot-reload mode. The frontend is given the selected backend URL automatically.

To stop the local PostgreSQL service:

```sh
pnpm dev:down
```

The applications can also be run separately with `pnpm dev:backend` and `pnpm dev:frontend`. When running them separately, their checked-in environment examples define the expected ports and database URL.

## Tests and builds

```sh
pnpm test
pnpm test:backend
pnpm test:backend:e2e
pnpm test:frontend
pnpm build
```

Backend and frontend build commands are also available as `pnpm build:backend` and `pnpm build:frontend`.

## Database and migrations

Local PostgreSQL is defined in `backend/docker-compose.yml` and persists its data in a Docker volume. Docker is only required for the bundled local database; a reachable PostgreSQL instance configured through `DATABASE_URL` can be used instead.

The backend automatically runs pending TypeORM migrations during startup. This applies to local development and deployed application starts, so the database schema is updated before the API begins serving requests.

Migrations can still be run manually for operational use with:

```sh
pnpm db:migrate
```

Development seed data is never created automatically. Add or refresh the development users manually when required:

```sh
pnpm db:seed:dev
```

Create local environment files by copying `backend/.env.example` and `frontend/.env.example` if you are not using the root development command.

## Local authentication

Sign in with one of the development seed users below. Their shared development password is `password123!`:

- `alex@example.com` - superadmin
- `ivan@example.com` - IT admin
- `anna@example.com` - admin
- `maria@example.com` - user
- `sam@example.com` - read-only guest

Set a unique `AUTH_SESSION_SECRET` of at least 32 characters in production. Set `DEV_AUTH_BYPASS=true` to opt into the `DEV_USER_EMAIL` development/test-only impersonation fallback for API development; it is never accepted in production.

## Application model

- Topics persist across meetings and keep an update/minute feed.
- Meetings receive recurring topics when they are created.
- Agenda ordering is stored per meeting and section; display numbering is calculated as `TOP 1`, `TOP 1.1`, and so on.
- Tasks can be linked to topics and meetings and tracked by assignee, due date, and status.
- Agenda sections are seeded by the database migration and can be administered by an admin.
- PrimeVue Editor stores rich text as HTML; displayed rich text is sanitized in the frontend.
