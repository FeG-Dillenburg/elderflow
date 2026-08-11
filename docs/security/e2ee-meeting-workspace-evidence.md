# Encrypted Meeting workspace evidence

Issue #51 moves Meeting protected content into two boundaries:

- the protected title is an independently authenticated scalar envelope;
- notes and appearance text live in one versioned encrypted Yjs document per Meeting.

## Storage and transport boundary

`meeting_documents`, `meeting_document_snapshots`, `meeting_document_updates`, and `meeting_document_mutations` store structure and opaque envelopes only. The migration refuses to run if legacy plaintext Meeting content exists, then removes the plaintext Meeting and appearance columns. Initial snapshots, atomic appearance initialization, and document updates cross the client boundary as canonical CBOR/binary bodies rather than base64 fields in ordinary JSON. The backend validates kind 5 update and kind 6 snapshot envelope headers, canonical encoding, Ed25519 signatures, UUID context, clocks, nonces, fingerprints, and byte limits without importing Yjs or holding the OCK.

Every protected Meeting response is narrowed explicitly and sent with `Cache-Control: no-store`. Guest and IT-admin roles receive no protected envelopes. Completed Meetings reject document updates and structural mutations, while immutable Topic scalar snapshots remain available for completed-history rendering.

## Client behavior

The browser holds the decrypted `Y.Doc` and OCK only in the unlocked session. Stable fragments cover general notes, opening input, preparation context, Person notes, and minutes. Loading applies the authenticated snapshot and ordered Update V2 envelopes. Rendering follows the authoritative structural agenda, so orphan fragments are ignored.

Adding an appearance submits its structural mutation and initial encrypted fragment in one transaction with an idempotency identifier. Recurrence reconciliation returns a structural-only plan: the unlocked client resolves the selected source workspace, creates an independent target fragment, and atomically moves the appearance with that opaque update. A failed target update rolls back both sides of the move. User-edited Preparation context is tracked as structural edit metadata so reconciliation preserves the appearance and retains the existing conflict behavior without exposing its text. Recurring Topics without a prior appearance copy the encrypted Topic description into an independent appearance fragment. Person Topics load the latest prior Meeting document and copy its Person note into an independent new fragment. Locked or unverifiable copy-forward fails before the structural mutation is sent.

## Verification matrix

- `frontend/src/e2ee/meeting-document-codec.spec.ts`: authenticated kind 5/kind 6 round trips, stable fragment independence, cross-document transplant rejection, snapshot reload, and corruption refusal.
- `backend/src/e2ee/meeting-document-envelope-validator.spec.ts`: backend-only canonical metadata/signature validation without Yjs.
- `backend/src/database/migrations/1720000014000-EncryptedMeetingWorkspaces.spec.ts`: destructive-transition guard and removal of legacy plaintext columns.
- `backend/src/meetings/meetings.service.spec.ts`: atomic appearance/update persistence and rollback on invalid opaque input.
- `backend/src/meetings/meetings.controller.spec.ts`: encrypted HTTP shape, authorization, and `no-store` behavior.
- `backend/test/meeting-workspaces.postgres.e2e-spec.ts`: real-transaction rollback, exact retry, replay refusal, and atomic recurrence move/copy-forward persistence.
- `frontend/src/api/domain.spec.ts` and `frontend/src/e2ee/meeting-document-session.spec.ts`: Recurring/Person local copy-forward, binary document transport, locked refusal, and local-state destruction when canonical rollback cannot be loaded.
- Recurrence, Topic history, frontend view, catalog parity, full unit suites, production builds, and PostgreSQL end-to-end tests form the regression gate.

The codec tests use fixed organizations, document/snapshot IDs, Yjs client IDs, OCKs, nonce prefixes, signing keys, clocks, and contexts as positive and negative interop vectors. `docs/security/fixtures/meeting-document-vectors.json` freezes the complete deterministic kind 5 and kind 6 envelope bytes and public keys; both the browser codec tests and the Node-only backend validator consume that same fixture. SHA-256 assertions provide an additional byte marker, while successful authenticated replay into a fresh document proves semantic compatibility.

## Reproducible reset and boundary smoke

The first encrypted development release intentionally starts from an empty Meeting data set. Reproduce the reset fixture with:

```sh
docker compose -f backend/docker-compose.yml down -v
docker compose -f backend/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm db:seed:dev
```

Use `EF51_MEETING_MARKER_7QX9` as a synthetic general-note marker. Unlock as a Content user, create a Meeting, add one Recurring Topic and one Person Topic, edit both independent target fragments, reload the browser, unlock again, and inspect preparation, active Agenda, completion, and Topic history. Locking before either copy-forward must leave the target appearance absent. The automated equivalent of the atomic negative and exact retry is:

```sh
pnpm test:backend:e2e
pnpm --filter @elderflow/frontend exec vitest run \
  src/e2ee/meeting-document-codec.spec.ts \
  src/e2ee/meeting-document-session.spec.ts
```

After the happy path, inspect the blind boundary:

```sh
docker compose -f backend/docker-compose.yml exec -T postgres \
  pg_dump -U elderflow elderflow > /tmp/elderflow-meeting-e2ee.sql
rg -n 'EF51_MEETING_MARKER_7QX9' /tmp/elderflow-meeting-e2ee.sql
rg -n 'EF51_MEETING_MARKER_7QX9' backend frontend \
  -g '!docs/security/e2ee-meeting-workspace-evidence.md'
```

Both searches must return no match. Browser network inspection must show opaque base64url envelopes only, `Cache-Control: no-store` on protected responses, no marker in URLs or browser storage/cache, and no marker in routine backend output. Complete the Meeting and verify a subsequent workspace update returns `MEETING_COMPLETED_IMMUTABLE` while the stored snapshot/update bytes remain unchanged.
