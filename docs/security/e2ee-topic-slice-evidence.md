# Topic scalar slice verification evidence

Parent issue #47 user story 68 requires the first encrypted release to reset synthetic development content and start from a fresh installation; in-place plaintext migration is explicitly out of scope. The migration refuses to erase Topic data itself. Start from a disposable development database and run:

```sh
docker compose -f backend/docker-compose.yml down -v
docker compose -f backend/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Use this exact fixture after first-superadmin key setup and unlock:

| Type | Name | Description / protected type fields |
| --- | --- | --- |
| Generic | `EF49_GENERIC_7QX9` | `<p>EF49_DESC_7QX9</p>` |
| Person | `EF49_PERSON_7QX9` | `<p>EF49_PERSON_DESC_7QX9</p>` |
| New membership | `EF49_MEMBER_7QX9` | process `EF49_PROCESS_7QX9`, godparents `EF49_GODPARENTS_7QX9` |
| Recurring | `EF49_RECURRING_7QX9` | `<p>EF49_RECURRING_DESC_7QX9</p>`, weekly, first due date `2026-08-17`, default section `Urgent topics` |

Add standalone Update `<p>EF49_UPDATE_7QX9</p>` to the Generic Topic. Confirm create, list, detail, edit, reload after lock/unlock, all structural filters, protected search for `7QX9`, name/recent sort, and history. Complete a Meeting containing the New membership Topic, change its live fields, and confirm the completed view/history retain the decrypted snapshot values. Lock and hard-reload; confirm localized locked placeholders, structural navigation, disabled protected search/write controls, and no plaintext in Network previews. The automated negative paths cover ciphertext corruption and a context transplant; both fail closed without a replacement write.

Inspect the running system using the exact markers above:

```sh
docker compose -f backend/docker-compose.yml exec -T postgres pg_dump -U elderflow elderflow > /tmp/elderflow-topic-e2ee.sql
rg -n 'EF49_(GENERIC|PERSON|MEMBER|RECURRING|DESC|PERSON_DESC|PROCESS|GODPARENTS|UPDATE)_7QX9' /tmp/elderflow-topic-e2ee.sql
rg -n 'EF49_(GENERIC|PERSON|MEMBER|RECURRING|DESC|PERSON_DESC|PROCESS|GODPARENTS|UPDATE)_7QX9' backend frontend -g '!frontend/src/e2ee/topic-slice-running-instance.spec.ts'
```

Both searches must return no marker occurrence outside deliberately named test fixtures. In browser DevTools, inspect Network response bodies, Application storage (Local Storage, Session Storage, IndexedDB, and Cache Storage), and Console output. The markers must not appear while locked or after a hard reload. The API responses carrying ciphertext must include `Cache-Control: no-store`. Inspect backend logs after each write and error case; neither markers nor envelope bytes may be logged.

The opt-in running-instance test creates the exact fixture, checks unlocked projections and standalone history, proves a transplant is rejected, checks locked placeholders, asserts `no-store`, scans raw HTTP payload text for the marker, and inspects Local and Session Storage. Run it once to create the fixture, restart the backend process, and run it again with `E2EE_EVIDENCE_PHASE=verify`:

```sh
VITE_API_BASE_URL=http://127.0.0.1:3998 \
VITE_E2EE_DEVELOPMENT_GATE=true \
E2EE_EVIDENCE_API_URL=http://127.0.0.1:3998 \
E2EE_EVIDENCE_PHASE=create \
E2EE_EVIDENCE_SETUP_PASSWORD=<startup-password> \
pnpm --filter @elderflow/frontend exec vitest run src/e2ee/topic-slice-running-instance.spec.ts

VITE_API_BASE_URL=http://127.0.0.1:3998 \
VITE_E2EE_DEVELOPMENT_GATE=true \
E2EE_EVIDENCE_API_URL=http://127.0.0.1:3998 \
E2EE_EVIDENCE_PHASE=verify \
pnpm --filter @elderflow/frontend exec vitest run src/e2ee/topic-slice-running-instance.spec.ts
```

Automated evidence is also provided by the scalar codec, volatile scalar session, Topic projection, DTO, backend envelope validator, migration, Topics service, Topic history, recurrence, and Meeting compatibility tests. Run the complete repository verification with:

```sh
pnpm test
pnpm test:backend:e2e
pnpm build
```

## Recorded results — 2026-08-11

- A fresh PostgreSQL 16 instance applied all 13 migrations. After fixture creation it contained `topics=4`, `updates=1`, `encrypted_topic_columns=4`, and `legacy_plaintext_columns=0`.
- The running-instance create phase passed. The backend process was stopped and started against the same database; the verify phase then decrypted all four exact Topic names and the standalone Update successfully.
- The locked HTTP Topic response contained no `7QX9` marker and carried `Cache-Control: no-store`. The context-transplant request returned `E2EE_ENVELOPE_CONTEXT_INVALID`.
- The PostgreSQL dump scan returned `dump_marker_matches=0`. The repository scan excluding the deliberately named running-instance fixture returned no matches. Backend output after the create, error, lock, and reload requests contained neither markers nor envelope bytes.
- Local Storage and Session Storage contained no marker. A source audit returned zero `indexedDB`, `CacheStorage`, `caches.*`, or service-worker references outside the evidence fixture, so this slice has no browser persistence/cache write path.
- The browser-runtime regression test passed and caught the CBOR typed-byte representation used outside Node. The default test run passed 433 tests (with the opt-in running-instance file skipped), the opt-in create and post-restart verify phases passed separately, all 20 PostgreSQL/HTTP E2E tests passed, and both production builds completed successfully.
