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

The command creates missing `backend/.env` and `frontend/.env` files from their examples, finds a free backend port beginning at 3000, starts PostgreSQL with Docker Compose when it is not reachable, runs pending migrations, and starts both applications in hot-reload mode. The frontend is given the selected backend URL automatically.

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

Run pending TypeORM migrations manually with:

```sh
pnpm db:migrate
```

Create local environment files by copying `backend/.env.example` and `frontend/.env.example` if you are not using the root development command.
