# Issue #48 E2EE key-slice evidence

## Reset and setup fixture

This is the first encrypted development release and intentionally has no plaintext migration or dual-read path. Reset synthetic development data before exercising setup:

Protected text has no plaintext compatibility mode. The frontend always uses encrypted content contracts, and the backend always rejects legacy writes containing Protected-text fields. Partial update contracts keep structural assignment, date, ordering, and status mutations usable. Guests receive role-aware projections without ciphertext, while eligible users see localized locked placeholders until their local key session is unlocked. Relock remounts the active route so plaintext view state is discarded immediately.

```sh
pnpm dev:down --volumes
docker compose -f backend/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm dev
```

Open `/setup`, enter the one-time backend setup password, create the first Superadmin and a distinct shared passphrase, print the displayed `EFR1.` Recovery Secret twice, verify both complete paper copies, and complete setup. The submitted canonical-CBOR setup body uses `application/vnd.elderflow.e2ee+cbor;v=1` and contains the three wrappers as byte strings, public UUID/version metadata, and `custodyCopiesAcknowledged: 2`; it contains neither the Recovery Secret nor an unwrapped key. Subsequent wrapper fetches and recovery-candidate submission/fetch use separate authenticated binary bodies with the same media type, while ordinary JSON carries public metadata only.

## Happy path

1. Sign in as an eligible Content user in browser A. Skip the immediate unlock and confirm structural navigation remains available with the header showing the locked state.
2. Choose **Unlock**, enter the shared passphrase, and confirm the unlocked indicator.
3. Open browser B with an independent profile, sign in as another eligible Content user, and unlock independently with the same passphrase.
4. Choose **Lock** in browser A. Confirm same-identity tabs relock through the content-free broadcast and that reload starts locked.
5. Start recovery in browser A with a paper Recovery Secret and a new shared passphrase. In browser B, enter the ceremony ID, the same Recovery Secret, and the proposed passphrase. Browser B decrypts both wrappers locally and approves only an exact ORK/fingerprint match. The backend reserves both signed application-session IDs exclusively for ceremony handlers and requires fresh presence heartbeats from both before activation. Activate and confirm every application session requires sign-in again.

## Fail-closed path

Use a wrong shared passphrase, wrong Recovery Secret, mismatched proposed passphrase, the initiating identity as approver, an expired/interrupted ceremony, a stale participant heartbeat, an operator authorization/session change, or a concurrently changed key generation. Each path returns one stable content-free error and leaves the current key state authoritative. IT admins and Guests receive `403` before any key wrapper or ceremony data is returned.

## Automated evidence

- Browser vectors and cleanup: `pnpm --filter @elderflow/frontend exec vitest run src/e2ee/crypto.spec.ts src/e2ee/unlock-session.spec.ts`
- Node reference vectors and canonical rejection: `pnpm --filter @elderflow/backend exec jest --runInBand src/e2ee/cross-runtime-vectors.spec.ts src/e2ee/envelope-validator.spec.ts`
- Backend state/authorization/atomicity: `pnpm --filter @elderflow/backend exec jest --runInBand src/e2ee/e2ee.service.spec.ts src/setup/setup.service.spec.ts src/auth/session.service.spec.ts src/auth/development-identity.guard.spec.ts`
- Catalog parity and setup UI: `pnpm --filter @elderflow/frontend exec vitest run src/i18n/catalogs.spec.ts src/views/SetupView.spec.ts src/App.spec.ts`
- Full gate: `pnpm test && pnpm build`

The machine-readable vectors are in [`e2ee-v1-key-vectors.json`](./e2ee-v1-key-vectors.json). They include unchanged RFC 5869 and RFC 8032 vectors, complete passphrase/recovery/OCK wrappers, independent client-epoch nonces, and a complete padded signed-scalar composition with negative version, transplant, corruption, canonicality, null/empty, and counter-reuse cases.

## Boundary inspection

Use a unique plaintext marker only in the passphrase input and another only as a locally displayed Recovery Secret. After setup, unlock, relock, failed recovery, and successful recovery:

```sh
docker compose -f backend/docker-compose.yml exec -T db pg_dump -U elderflow elderflow | rg 'MARKER|EFR1\.'
rg 'MARKER|EFR1\.' backend/logs frontend/dist
```

Expected output is empty. Inspect browser DevTools Network and Application panels: key responses have `Cache-Control: no-store`; Local Storage contains only the authentication token; IndexedDB, Cache Storage, URLs, request bodies, and routine logs contain no passphrase, Recovery Secret, ORK, OCK, signing private key, or plaintext marker. The browser limitation remains explicit: JavaScript cannot guarantee physical erasure, but every owned `Uint8Array` is zeroed and the Worker is terminated.
