# Task and dashboard E2EE slice evidence

## Synthetic fixture

Use the issue #49 running-instance setup first so the installation and `evidence@example.com` Content user exist. Start Elderflow against a disposable PostgreSQL database, then run:

```sh
E2EE_EVIDENCE_API_URL=http://localhost:3000 \
E2EE_EVIDENCE_PHASE=create \
pnpm --filter @elderflow/frontend exec vitest run src/e2ee/task-slice-running-instance.spec.ts
```

The fixture uses `EF50_TASK_TITLE_7QX9`, `EF50_TASK_DESCRIPTION_7QX9`, `EF50_TASK_EDITED_7QX9`, and `EF50_DESCRIPTION_EDITED_7QX9`. It creates two Tasks, rejects a cross-record envelope transplant, edits the first Task, observes it in the dashboard, completes it through a structural-only patch, and verifies locked placeholders and `Cache-Control: no-store`.

Capture the database and routine backend output, restart the backend without resetting PostgreSQL,
then verify decrypt-after-restart with a fresh client epoch:

```sh
pg_dump "$DATABASE_URL" > /tmp/elderflow-50.sql
E2EE_EVIDENCE_API_URL=http://localhost:3000 \
E2EE_EVIDENCE_PHASE=verify \
E2EE_EVIDENCE_DATABASE_DUMP=/tmp/elderflow-50.sql \
E2EE_EVIDENCE_BACKEND_LOG=/tmp/elderflow-backend.log \
pnpm --filter @elderflow/frontend exec vitest run src/e2ee/task-slice-running-instance.spec.ts
```

## Boundary inspection

Capture a PostgreSQL dump and backend routine log while the fixture runs, then verify that neither contains the marker prefix:

```sh
pg_dump "$DATABASE_URL" > /tmp/elderflow-50.sql
rg 'EF50_' /tmp/elderflow-50.sql /tmp/elderflow-backend.log
```

The running-instance test checks raw Task HTTP payloads, Guest ciphertext exclusion, IT-admin
endpoint denial, Web Storage, the supplied PostgreSQL dump, and the supplied routine backend log.
It scans Cache Storage and IndexedDB when the test environment exposes those APIs. Because the
documented jsdom runner does not expose them by default, it otherwise performs an explicit
production-source audit and fails if Elderflow has any Cache Storage or IndexedDB access path;
the boundary is never silently skipped. The test fails if any inspected boundary contains the
marker prefix.

## Automated evidence

- `backend/src/database/migrations/1720000013000-EncryptedTaskScalars.spec.ts` proves plaintext columns are removed, #49 column naming is retained, and `e2ee_scalar_writes` is not recreated.
- `backend/src/tasks/tasks.service.spec.ts` proves structural filtering and atomic scalar writes through the shared ledger.
- `backend/src/tasks/task-response.spec.ts` and `backend/src/dashboard/dashboard.service.spec.ts` prove narrow projections and Guest/IT-admin ciphertext exclusion.
- `backend/test/tasks.postgres.e2e-spec.ts` uses the real scalar validator and shared
  `e2ee_scalar_writes` entity in PostgreSQL, proves duplicate-write idempotency and commit
  revisions, runs the Task migration against a pre-existing #49 ledger table, and verifies the
  encrypted column names and absence of plaintext Task columns.
- `frontend/src/e2ee/task-scalars.spec.ts` proves client encryption/decryption, context binding inputs, structural-only completion, and locked/unavailable projections.
- `frontend/src/views/TasksView.spec.ts` proves local Protected-text filtering and editing; `frontend/src/i18n/catalogs.spec.ts` proves English/German parity.

No production dependency is introduced by this slice; it reuses the reviewed scalar codec and cryptographic dependencies recorded for issue #49.
