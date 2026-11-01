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


## Saved Topic fields (#118)

Committed Meeting field saves and ordinary Topic updates emit an identifier-only
`topic-changed` invalidation. The existing collaboration relay batches nearby
changes, resolves appearances in its open Planned/In-progress Meeting rooms,
and checks each connection's current authorization before sending. No scalar
plaintext or envelopes travel in notifications. This reuses the existing
process-local EventEmitter and WebSocket rooms: cross-process delivery is not
provided, so deployments must keep these writers and rooms in one backend process.
Existing collaboration eligibility is unchanged: Guests do not join these live
rooms. No broker, database migration, or encrypted-format change is introduced.

The provider maps this invalidation onto the existing Agenda refresh seam.
Workspace refreshes coalesce and serialize; a response superseded by a later
invalidation is not published. Existing document synchronization retains the
attached Yjs document, pending encrypted updates, awareness, and editors.
Reauthentication also invalidates the Agenda to recover missed saves.
Completed Meeting rooms are excluded and historical snapshots remain authoritative.

Inline membership drafts and Topic edit dialogs retain dirty/in-flight input
separately from incoming saved values. Encrypted Agenda edits send the revision
captured with their draft; the locked Topic transaction rejects stale revisions
with `TOPIC_FIELDS_CHANGED`. An explicit retry can adopt the latest baseline;
there is no automatic last-write-wins retry. Revision preconditions are optional
for compatibility with existing API callers and do not change the envelope format.

The PostgreSQL workspace integration suite exercises two ticket-authenticated
users, real client scalar encryption/decryption, committed persistence, WebSocket
routing to shared Meetings, the workspace read model, stale drafts, rejected
ciphertext, and foreign-key rollback. Component/provider suites cover draft
retention, untouched fields, coalescing, reconnect invalidation, and existing
completion/compaction/security lifecycle behavior. This is an integration harness,
not a manual two-browser verification.


### HTTP-boundary regression

The initial saved-field integration harness bypassed the global HTTP interceptor.
Its revision metadata used plaintext field names (`godparents`, `description`,
and `membershipProcessStatus`), so the recursive plaintext guard rejected those
numeric revisions as legacy content with `E2EE_PROTECTED_TEXT_WRITE_REQUIRED`.
The frontend now serializes revision metadata using explicit `*CommitRevision`
properties; the backend DTO and locked revision checks use those same properties.
The plaintext guard remains unchanged. The cross-boundary frontend test feeds
actual serialized patches through that guard for all four scalar fields. The
PostgreSQL harness now sends the encrypted save through the real Topics controller,
production plaintext interceptor, and strict DTO validation before checking
second-user decryption and workspace updates.


A two-browser follow-up on the Planned Meeting preparation screen verified both
membership process status and godparents: a normal User saved temporary markers
in Safari and the Superadmin session in the in-app browser displayed them without
reload. The Superadmin then restored the original values and Safari displayed
those restores without reload. Both browsers remained unlocked and connected;
no unlock-required error appeared. The original values were restored after the
verification.
