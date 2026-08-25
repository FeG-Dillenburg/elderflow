# E2EE running-instance verification

This is the reproducible release gate for the internal [E2EE security review](./e2ee-security-review.md). It must run only against a disposable or explicitly approved non-production installation. Never reset, truncate, or replace the persistent staging/production PostgreSQL volume.

Reviewed production revision: `62f719fc321e4da87aefac5bd69487311747a66e` ([GitHub tree](https://github.com/FeG-Dillenburg/elderflow/tree/62f719fc321e4da87aefac5bd69487311747a66e)). Recorded execution: 2026-08-25, PostgreSQL 16, Node 26.5.0 (project floor Node 20), pnpm 10.26.1.

## What passes

The gate passes only when:

- the exact vector and complete repository gates pass;
- one encrypted scalar marker and Collaborative-text markers are readable only after local unlock;
- two independent client epochs edit separate fragments, an encrypted pending edit survives a transient disconnect, and both contexts converge;
- raw locked/protected API payloads, sent WebSocket frames, PostgreSQL rows/dump, routine backend output, URLs, and browser durable stores contain no marker;
- restart against the same PostgreSQL data followed by sign-in/unlock restores both scalar and Collaborative text exactly;
- Meeting completion freezes the canonical ciphertext and a later write returns `MEETING_COMPLETED_IMMUTABLE`;
- IT-admin, Guest, locked, and unauthorized journeys reveal no prohibited content or key operation;
- English/German parity and physical-browser keyboard, focus, ARIA, responsive, and non-color-only feedback checks pass.

Any marker match, missing `no-store`, unexpected plaintext-capable storage, unresolved link, untranslated string, silent late-write loss, non-convergence, or stable-boundary error failure is a release failure.

## Safe fixture

The automated fixture uses:

- scalar: Meeting title `EF54_SCALAR_7QX9`;
- Collaborative text: `EF54_COLLAB_7QX9_A`, `EF54_COLLAB_7QX9_B`, and `EF54_COLLAB_7QX9_OFFLINE_B` in separate Meeting fragments;
- a deliberately late value `EF54_COLLAB_7QX9_LATE_REJECTED` that must never commit;
- synthetic account `evidence@example.com` from the Topic slice fixture;
- fixed synthetic UUIDs under `00000000-0000-4000-8000-*`.

The database container is named `elderflow-e2ee54-postgres`, publishes only local port `55432`, stores PostgreSQL data in tmpfs, and deletes that data when stopped. Confirm that name and port are unused before starting.

## Prerequisites and exact automated commands

From the repository root, confirm the revision and working tree. Dossier-only changes may be present; production E2EE code under review must match the recorded revision.

```sh
git rev-parse 62f719fc321e4da87aefac5bd69487311747a66e
git diff --name-only 62f719fc321e4da87aefac5bd69487311747a66e -- backend/src frontend/src backend/test
pnpm install --frozen-lockfile
pnpm test:e2ee:vectors
```

Start isolated PostgreSQL. Do not substitute the ordinary persistent `backend-postgres-1` or staging container.

```sh
docker run --rm -d \
  --name elderflow-e2ee54-postgres \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=elderflow \
  -e POSTGRES_USER=elderflow \
  -e POSTGRES_PASSWORD=elderflow-e2ee54 \
  -p 55432:5432 \
  postgres:16-alpine
```

Build and start the real NestJS application, preserving stdout/stderr as the routine-log artifact. The application runs forward migrations automatically. Copy the generated `Initial setup password` from this terminal; it is valid only for this disposable process.

```sh
pnpm --filter @elderflow/backend build
env \
  DATABASE_URL=postgresql://elderflow:elderflow-e2ee54@127.0.0.1:55432/elderflow \
  PORT=3999 \
  NODE_ENV=development \
  AUTH_SESSION_SECRET=e2ee54-local-smoke-only-session-secret \
  DEV_AUTH_BYPASS=false \
  DEV_USER_EMAIL=evidence54@example.com \
  node backend/dist/main.js 2>&1 | tee /tmp/elderflow-e2ee54-backend.log
```

In a second terminal, create the setup/Topic prerequisite and then the final two-context fixture. Replace the one placeholder with the generated setup password.

```sh
env \
  VITE_API_BASE_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_API_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_PHASE=create \
  E2EE_EVIDENCE_SETUP_PASSWORD=<setup-password-from-backend-output> \
  pnpm --filter @elderflow/frontend exec vitest run \
  src/e2ee/topic-slice-running-instance.spec.ts

env \
  VITE_API_BASE_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_API_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_PHASE=create \
  pnpm --filter @elderflow/frontend exec vitest run \
  src/e2ee/e2ee-release-running-instance.spec.ts
```

Inspect the first persistence boundary. `rg` must print nothing and exit 1 because there is no match.

```sh
docker exec elderflow-e2ee54-postgres \
  pg_dump -U elderflow elderflow > /tmp/elderflow-e2ee54-before.sql
rg -n 'EF54_' /tmp/elderflow-e2ee54-before.sql
```

Stop only the backend process with `Ctrl-C`; leave the disposable PostgreSQL container running. Restart the same backend command above, changing `tee` to `tee -a` so both process runs remain in the routine-log artifact, then run the verify phase:

```sh
env \
  VITE_API_BASE_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_API_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_PHASE=verify \
  E2EE_EVIDENCE_DATABASE_DUMP=/tmp/elderflow-e2ee54-before.sql \
  E2EE_EVIDENCE_BACKEND_LOG=/tmp/elderflow-e2ee54-backend.log \
  pnpm --filter @elderflow/frontend exec vitest run \
  src/e2ee/e2ee-release-running-instance.spec.ts

docker exec elderflow-e2ee54-postgres \
  pg_dump -U elderflow elderflow > /tmp/elderflow-e2ee54-after.sql
rg -n 'EF54_' \
  /tmp/elderflow-e2ee54-before.sql \
  /tmp/elderflow-e2ee54-after.sql \
  /tmp/elderflow-e2ee54-backend.log
```

Expected verify observations:

- exact title and all three collaborative values decrypt after restart;
- Guest receives structural data without Protected payload, while IT-admin and invalid-session requests cannot fetch the workspace;
- HTTP workspace/Meeting bodies contain no `EF54_` and use `Cache-Control: no-store`;
- captured incoming and outgoing WebSocket JSON contains tickets and opaque base64url envelopes, not markers;
- both cryptographic client contexts converge after concurrent and disconnected edits;
- the completed Meeting rejects the late envelope with `MEETING_COMPLETED_IMMUTABLE` and its canonical workspace remains byte-identical on reload;
- routine backend output for that rejection contains only `{ outcome: 'MEETING_COMPLETED_IMMUTABLE' }`;
- both dump scans have zero matches.

Run the full final gates after the running instance is stopped:

```sh
pnpm test
TEST_DATABASE_URL=postgresql://elderflow:elderflow-e2ee54@127.0.0.1:55432/elderflow \
  pnpm test:backend:e2e
pnpm build
```

## Physical-browser and UI procedure

Automation covers the real REST/WebSocket/PostgreSQL seam, but physical browser storage, accessibility, and responsive behavior must be checked in supported browsers. Start the Vite frontend against the running backend:

```sh
env VITE_API_BASE_URL=http://127.0.0.1:3999 \
  pnpm --filter @elderflow/frontend dev \
  --host 127.0.0.1 --port 5174 --strictPort
```

Use two genuinely separate browser profiles or private contexts, A and B. Do not use two tabs sharing one storage partition as the only evidence.

1. Before completion, create a fresh fixture or pause the create harness before its completion phase. In A, sign in as an eligible Content user, skip unlock, and confirm structural navigation plus localized locked placeholders. The title and all document markers must be absent from Network response previews.
2. Unlock A with the fixture shared passphrase. In B, sign in independently and unlock. Confirm the visible unlocked indicator in both contexts.
3. In Meeting preparation, edit general notes in A and the appearance Preparation context in B. Use keyboard-only navigation to enter/leave each editor. Confirm focus is visible, editor names/descriptions are announced, and the two fragments never cross-write.
4. Disconnect B in DevTools Network. Edit opening input in B and general notes in A. Confirm offline/pending feedback uses text/iconography rather than color alone. Reconnect B; confirm pending clears and both contexts converge.
5. Inspect Network and Application in both contexts: no marker in URLs, Local Storage, Session Storage, IndexedDB, Cache Storage, service-worker caches, or locked response text; protected HTTP responses say `no-store`; WebSocket frames contain opaque envelopes only.
6. Hard reload both contexts. They must start locked. Unlock and confirm all committed markers return.
7. In A, complete the Meeting while B holds a disconnected edit. Reconnect B. Confirm a visible localized discarded-change message, canonical frozen reload, and read-only Completed Meeting.
8. Sign in as IT admin: no unlock, ciphertext-delivery, recovery, rotation, or editor path. Sign in as Guest: read-only structural behavior only, with no write ticket. Verify an unrelated or authorization-lost context is rejected.
9. Switch English/German and repeat locked, offline, rejected/discarded, and key-operation status checks. At phone width, verify unlock and ceremony layouts without horizontal loss; check keyboard order, focus restoration/trapping, ARIA labels/live feedback, and non-color-only states.

Record only compact observations/screenshots without Protected text beyond these synthetic markers. Do not attach full network traces, dumps, console logs, secrets, or ciphertext bodies to the repository.

## Ceremony and rollback checks

Using two distinct eligible identities, exercise one successful representative routine or compromise ceremony plus an abort/race path as described in [key-operation evidence](./e2ee-key-rotation-evidence.md). Verify session/client-epoch revocation, authoritative-key writes, historical readability, content-free audit facts, and byte-identical Completed Meeting ciphertext. Routine grace and compromise no-grace must differ exactly as documented.

The recorded representative ceremony is the automated planned Root-key rotation. Run it only after the verify phase has completed the Meeting:

```sh
env \
  VITE_API_BASE_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_API_URL=http://127.0.0.1:3999 \
  E2EE_EVIDENCE_PHASE=ceremony \
  pnpm --filter @elderflow/frontend exec vitest run \
  src/e2ee/e2ee-release-running-instance.spec.ts

docker exec elderflow-e2ee54-postgres psql -U elderflow -d elderflow -x -c \
  'SELECT generation, ork_id, ock_id, ock_epoch FROM e2ee_key_state;
   SELECT count(*) FILTER (WHERE revoked_at IS NULL) AS active_epochs,
          count(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked_epochs
   FROM e2ee_client_epochs;
   SELECT event_type, key_generation, outcome, operation, reason_code, ork_id, ock_id
   FROM e2ee_audit_events ORDER BY created_at;'
```

The phase requires independent initiator and approver sessions, verifies the candidate independently, activates generation 2, proves the old session is rejected, unlocks the rotated authoritative state in a fresh session, rereads the historical scalar/document markers, and compares the Completed workspace byte-for-byte. The compact SQL result must show the expected generation/key identifiers, revoked old epochs, and only content-free audit facts.

There is no automatic key rollback. Before activation, failure leaves current state untouched. After activation, correction is a new ceremony. Application rollback after real encrypted data exists is only to a release compatible with the same encrypted formats and backups; plaintext columns/writes are never restored.

## Cleanup

Stop the backend/frontend processes, then remove only the named disposable container. Because it used `--rm` and tmpfs, its synthetic data is not recoverable after this command.

```sh
docker stop elderflow-e2ee54-postgres
```

Do not run `docker compose down -v` against staging or any installation holding real data.

## Recorded result — 2026-08-25

- `pnpm test:e2ee:vectors`: pass; backend 6 suites / 19 tests, frontend 5 files / 15 tests.
- Running-instance create: pass; two independent cryptographic client contexts edited separate fragments, then an encrypted offline edit reconnected and both contexts converged from the canonical workspace.
- PostgreSQL dump scan before restart: zero `EF54_` matches.
- Restart with the same tmpfs PostgreSQL data: pass; exact scalar and Collaborative-text markers decrypted under a fresh client epoch; Guest, IT-admin, locked, and invalid-session boundaries returned no marker or prohibited workspace.
- Completion/late write: pass; stable rejection `MEETING_COMPLETED_IMMUTABLE`, with byte-identical canonical workspace before and after the rejected write; completed dump scan had zero marker matches.
- Raw HTTP/WebSocket and routine-log checks: pass; protected HTTP used `no-store`; both WebSocket directions and content-free logs had zero marker matches.
- Planned Root-key rotation: pass with two distinct eligible sessions; generation advanced to 2, the authoritative Root Key changed while the Content Key remained, four old epochs were revoked, a fresh epoch restored historical scalar/document reads, Completed workspace bytes were unchanged, and the audit row contained only `key_ceremony_activated`, generation/key IDs, `success`, `rotate_root_key`, and `planned_root_rotation`.
- Web Storage: pass in the harness. Cache Storage and IndexedDB are not available in jsdom and are therefore covered only by the physical-browser inspection below, not by source-text inference.
- Isolated physical Chrome: pass for login/unlock, exact scalar display, hard-reload relock, zero marker matches in Local/Session/Cache Storage and IndexedDB, zero service-worker registrations, named unlock-dialog/navigation/status/form controls in the accessibility tree, and no horizontal overflow at 390 × 844. Marker creation through the UI, full two-window interaction, keyboard/focus traversal, and the second supported browser were not executed in this recorded run and remain mandatory operator release checks.
- `pnpm test`: pass; backend 54 suites / 189 tests and frontend 56 files / 307 tests, with the three opt-in running-instance tests skipped in the ordinary run.
- `pnpm test:backend:e2e`: pass against disposable PostgreSQL; 9 suites / 26 tests.
- `pnpm build`: pass for NestJS and the Vue/TypeScript production build. The existing Vite warnings for the externalized libsodium `crypto` fallback and chunks over 500 kB remain the documented bundle concern.
