# Issue #53 Protected-text key-operation evidence

## Existing-data upgrade

Migration `1720000018000-KeyRotationCeremonies` upgrades the existing recovery-ceremony table in place. It backfills candidate Root/Content Key identifiers and wrappers from the authoritative singleton key state, adds generalized operation and reason codes, and seeds the historical-wrapper registry from the current Content Key wrapper. It does not reset, truncate, or replace existing key or ciphertext tables.

Run against a PostgreSQL copy containing existing encrypted Topic, Update, Task, Meeting scalar, active Meeting-document, pending-update, snapshot, and Completed Meeting rows:

```sh
pnpm db:migrate
pnpm --filter @elderflow/backend exec jest --runInBand \
  src/database/migrations/1720000018000-KeyRotationCeremonies.spec.ts \
  src/e2ee/e2ee.service.spec.ts
```

Verify the pre-upgrade `e2ee_key_state` row and all Protected ciphertext columns remain present and byte-identical. Verify `e2ee_content_key_wrappers` contains the pre-upgrade current wrapper.

## Situation-based UI and two-operator happy paths

Sign in as two distinct eligible Key operators in separate browser profiles and open `/key-recovery`. The first screen asks what happened and offers dedicated entry points for:

- lost shared passphrase;
- routine passphrase change after a team change;
- routine passphrase change after another access-policy change;
- lost Recovery Secret;
- routine Recovery Secret custody change;
- planned Organization Root Key rotation;
- suspected shared-passphrase disclosure;
- suspected Recovery Secret disclosure; and
- suspected encryption-key disclosure.

Complete each entry point in turn. The initiating and approving browsers must independently unlock and verify the same canonical binary candidate. Recovery Secret replacement and compromise response display a new secret only until the initiating operator re-enters the secret independently from each of two paper copies. The approving operator must also enter the proposed secret to verify the candidate independently. Activation requires both participating sessions to remain present, increments the authoritative generation atomically, revokes every application session and browser client epoch, and returns both operators to sign-in. Custody acknowledgement is attributed to the initiating operator who verified both copies.

## Routine versus compromise behavior

- Routine passphrase change changes only the shared-passphrase slot.
- Recovery Secret replacement changes only the Recovery slot and records two custody acknowledgements.
- Root rotation creates new unlock slots and rewraps every readable Content Key without changing content ciphertext.
- Any suspected disclosure creates new Root and Content Keys. The old Content Key is immediately non-writable, but is rewrapped under the new Root Key for historical reads.
- Eligible routine transitions mark the former browser epoch revoked but permit exact pending encrypted writes from that epoch for seven days. Existing retry controls retain failed input. After the grace deadline, or for any compromise transition, the server rejects the old epoch and the user must unlock and reseal the retained input under a new epoch.

Before and after every operation, hash all encrypted scalar columns, Meeting-document updates/snapshots, and Completed Meeting projections. Routine operations and Root rotation must leave all content ciphertext byte-identical. Compromise response must also leave existing ciphertext byte-identical; only later writes use the new Content Key.

## Fail-closed and race checks

Exercise same-operator approval, mismatched candidate secrets, expiry, stale presence, relock/logout, operator ineligibility, a concurrent ceremony, and a compare-and-swap loss. Every path must return a stable localized error, leave the current generation and wrappers authoritative, and persist no candidate as active.

## Automated gates

```sh
pnpm --filter @elderflow/frontend exec vitest run \
  src/views/RecoveryView.spec.ts \
  src/e2ee/crypto.spec.ts \
  src/e2ee/key-ceremony-payload.spec.ts \
  src/e2ee/scalar-session.spec.ts \
  src/e2ee/meeting-document-session.spec.ts \
  src/i18n/catalogs.spec.ts

pnpm --filter @elderflow/backend exec jest --runInBand \
  src/e2ee/e2ee.service.spec.ts \
  src/e2ee/e2ee.controller.spec.ts \
  src/e2ee/key-ceremony-payload.spec.ts \
  src/database/migrations/1720000018000-KeyRotationCeremonies.spec.ts

pnpm test
pnpm build
```

Use unique markers only in browser-owned passphrase, Recovery Secret, and Protected-text inputs. Inspect PostgreSQL dumps, routine backend logs, browser storage/caches, URLs, and HTTP/WebSocket captures. Markers and plaintext keys must be absent; ceremony audit facts may contain only operation/reason codes, actor IDs, key IDs/generation, outcome, and timestamps.
