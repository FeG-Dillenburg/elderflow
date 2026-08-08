# Versioned ciphertext, key, and collaboration formats

Research for the Wayfinder ticket “Define versioned ciphertext, key, and collaboration formats,” captured 2026-08-08.

## Decision

ElderFlow should own a small binary protocol rather than adopt Secsync's runtime state machine. Version 1 should use:

- deterministic CBOR for every authenticated or signed structure;
- XChaCha20-Poly1305-IETF with 32-byte keys, 24-byte nonces, and 16-byte authentication tags;
- Argon2id v1.3 through libsodium's `crypto_pwhash` API for a shared passphrase slot, with the algorithm and exact cost parameters stored in the slot;
- HKDF-SHA-256 for high-entropy recovery secrets and all root/content-key purpose separation;
- Ed25519 detached signatures for client-authored scalar writes and Meeting envelopes;
- one random 32-byte Organization Root Key (ORK), and independently random, identified 32-byte Organization Content Keys (OCKs);
- Yjs update format V2 as a separately versioned Meeting-document codec, not as part of the cryptographic suite;
- deterministic, per-key-context nonces made from a random 16-byte client-epoch prefix and an unsigned 64-bit big-endian counter; and
- server-assigned commit revisions/sequences that remain outside the signed ciphertext envelope and continue to own scalar last-write-wins and relay ordering.

This is a production format commitment, but not a claim that the construction has been independently audited. The required security dossier must contain the vectors and negative tests specified below before release. This matches the local decision to call the project artifact a security review dossier rather than an audit ([ADR 0019](../adr/0019-publish-an-e2ee-security-review-dossier.md)).

## Why these primitives

Libsodium documents XChaCha20-Poly1305 as its recommended related-message AEAD and says random nonces are acceptable because XChaCha has a 192-bit nonce; its API fixes the key, nonce, and tag sizes used here ([libsodium XChaCha20-Poly1305](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction), [encrypted-message guidance](https://doc.libsodium.org/secret-key_cryptography/encrypted-messages)). Explicit counters are still preferable for ElderFlow because they also supply replay identities and make nonce reuse mechanically testable.

The official libsodium.js project compiles libsodium to WebAssembly with a pure-JavaScript fallback, runs in browsers and Node, and exposes the same binary-buffer API as the C library. Its `crypto_pwhash_*` functions require the `libsodium-wrappers-sumo` build; production must pin and integrity-check that dependency rather than retain the prototype's indirect Secsync runtime ([libsodium.js README](https://github.com/jedisct1/libsodium.js#readme)).

Argon2id v1.3 is an explicit libsodium algorithm identifier. Libsodium's key-derivation API requires the salt, algorithm, operation limit, and memory limit to reproduce a key and expressly says to store these rather than rely on named constants whose values may change ([libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf)). RFC 9106's memory-constrained recommendation is Argon2id with 64 MiB, three passes, four lanes, a 128-bit salt, and a 256-bit result ([RFC 9106, section 4](https://www.rfc-editor.org/rfc/rfc9106.html#section-4)). Libsodium does not expose the RFC's lane count in `crypto_pwhash`, so ElderFlow's normative profile is the libsodium API tuple below, not a claim to implement the RFC preset byte-for-byte.

HKDF is an extract-then-expand KDF intended for high-entropy input; its `info` field is specifically intended to bind derived output to application and context, and browsers expose HKDF through `SubtleCrypto` in secure contexts and workers ([RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html), [MDN `deriveBits`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits)). ElderFlow should use the same RFC 5869/HMAC-SHA-256 results in browser and backend test harnesses, even if the browser implementation is Web Crypto and the reference-vector implementation is another maintained library.

Ed25519 has fixed 32-byte public keys and 64-byte signatures and published test vectors; libsodium exposes detached sign/verify operations ([RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html), [libsodium signatures](https://doc.libsodium.org/public-key_cryptography/public-key_signatures)). Signatures provide attribution to a registered client epoch and let the opaque relay reject malformed/replayed public envelopes. They do not make an authorized writer trustworthy or make encrypted Yjs operations server-validatable.

CBOR supplies byte strings directly and defines deterministic encoding requirements. ElderFlow should use RFC 8949 core deterministic encoding, definite lengths only, shortest integer/length forms, no floats or tags, no duplicate map keys, and reject trailing bytes or non-deterministic alternative encodings ([RFC 8949, section 4.2](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2)). Version 1 uses arrays rather than maps in authenticated structures, avoiding key-order ambiguity.

All random keys, salts, client-epoch IDs, and nonce prefixes must come from libsodium `randombytes_buf` or browser `crypto.getRandomValues`, never `Math.random`. The browser API supplies cryptographically strong values and is available in workers ([MDN `getRandomValues`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)).

## Normative binary rules

The notation below is normative:

- `u8`, `u16`, `u32`, and `u64` mean non-negative CBOR integers restricted to the indicated range. Whenever an integer is converted to raw bytes (nonce counters and vector sorting), use unsigned big-endian/network order.
- `uuid` means the 16 raw octets of an RFC 9562 UUID in network order, never its 36-character rendering. RFC 9562 fixes UUIDs at 16 octets and network byte order ([RFC 9562, section 4](https://www.rfc-editor.org/rfc/rfc9562.html#section-4)). IDs may remain the repository's chosen UUID version; this protocol treats them as opaque.
- `bstrN` means a CBOR byte string of exactly N octets. `tstr` is well-formed UTF-8. Decoders reject malformed UTF-8.
- UUID, key, and hash comparisons and vector sorting use unsigned lexicographic byte order.
- All length limits are checked before CBOR allocation, signature verification, decryption, decompression, or Yjs application.

### Version registries

These registries are independent and must never be collapsed into one number:

| Registry | Version 1 meaning |
| --- | --- |
| `envelopeFormat` | deterministic-CBOR layouts in this note |
| `cryptoSuite` | XChaCha20-Poly1305-IETF + HKDF-SHA-256 + Ed25519 |
| `passphraseKdf` | libsodium Argon2id v1.3 API profile |
| `meetingCodec` | Yjs update format V2; the release manifest pins one exact supported `yjs@13.6.x` patch |
| `awarenessCodec` | ElderFlow awareness tuple below |

The common encrypted envelope is the deterministic CBOR array:

```text
[envelopeFormat=1, kind, cryptoSuite=1, header, ciphertext, signature]
```

`kind` is `1=shared-passphrase ORK slot`, `2=recovery ORK slot`, `3=OCK wrapper`, `4=encrypted scalar`, `5=Meeting update`, `6=Meeting snapshot`, or `7=Meeting awareness`. `header` is the exact kind-specific array defined below. `ciphertext` is one CBOR byte string. `signature` is CBOR `null` for kinds 1–3 and a 64-byte Ed25519 signature for kinds 4–7. No array may contain additional elements.

For every kind, AEAD associated data is exactly:

```text
deterministicCBOR([1, kind, 1, header])
```

For signed kinds, the Ed25519 message is exactly this ASCII/UTF-8 domain prefix, including the final NUL byte, followed by deterministic CBOR:

```text
"ElderFlow signed envelope v1\0" ||
deterministicCBOR([1, kind, 1, header, ciphertext])
```

The signature is outside that signed CBOR value. Verification precedes decryption. Altering any public header field, nonce, ciphertext byte, kind, suite, or version therefore invalidates either the signature, AEAD tag, or both.

`envelopeHash` everywhere below means SHA-256 of the complete deterministic-CBOR envelope, including its signature/null field, using the standardized SHA-256 digest ([NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final)). It is an opaque replay/ancestry identifier, not a replacement for signature or AEAD verification.

### HKDF profile and purpose registry

Every HKDF invocation is RFC 5869 HKDF-SHA-256 with a 32-byte output. No truncation is used. For content keys:

```text
salt = organizationId                         // 16 raw UUID bytes
info = deterministicCBOR([
  "ElderFlow key v1",
  purpose,
  aggregateType,
  aggregateId
])
```

`aggregateType` is a stable `u16` registry value, not a class name, database table, translated enum, or URL. Reserve `0=Organization` and `1=MeetingDocument`; scalar owners use the Protected-text inventory's immutable values starting at 256 so infrastructure and domain registries cannot collide. `aggregateId` is the aggregate UUID. The production spec must publish the scalar aggregate-type and protected-field numeric registries beside the Protected-text inventory; assigned values are immutable.

Purpose values are:

| Purpose | Input key material | Aggregate |
| --- | --- | --- |
| 1 `ock-wrap` | ORK | Organization / OCK ID |
| 2 `passphrase-ork-wrap` | Argon2id output | Organization / slot ID |
| 3 `recovery-ork-wrap` | recovery secret | Organization / slot ID |
| 10 `scalar-aead` | OCK | owning record / field discriminator included in `aggregateId` input below |
| 20 `meeting-update-aead` | OCK | Meeting document |
| 21 `meeting-snapshot-aead` | OCK | Meeting document |
| 22 `meeting-awareness-aead` | OCK | Meeting document |

For purpose 10 only, `aggregateId` is `recordId || u16be(fieldId)` (18 bytes), not a UUID. This yields a distinct key per record field. For purpose 1, `aggregateId` is `ockId`; for purposes 2–3 it is `slotId`; for purposes 20–22 it is `documentId`. A derived key is used only for its named purpose.

## Key hierarchy and unlock slots

ORKs and OCKs are independent random 32-byte values. Their UUID identifiers are public metadata and are never derived from key bytes. One OCK is `current-for-write`; any older OCK whose ID is still referenced by ciphertext remains `readable`. An OCK epoch is a public monotonic `u32` display/order value, not key material and not a substitute for its UUID.

### Shared-passphrase slot

The user input is normalized to Unicode NFC as defined by Unicode Normalization Form C, encoded once as UTF-8, and neither trimmed nor case-folded ([Unicode Standard Annex 15](https://unicode.org/reports/tr15/)). Creation requires confirming the normalized value; unlock applies the identical transformation. The v1 Argon2id call is:

```text
crypto_pwhash(
  outputLength = 32,
  password = normalized UTF-8 passphrase,
  salt = slot salt (16 bytes),
  opslimit = 3,
  memlimit = 67_108_864 bytes,
  algorithm = crypto_pwhash_ALG_ARGON2ID13
)
```

The header for kind 1 is:

```text
[organizationId:uuid, slotId:uuid, orkId:uuid,
 passphraseKdf=1:u8, opslimit=3:u32, memlimit=67108864:u64,
 salt:bstr16, nonce:bstr24]
```

Derive the wrapping key from the 32-byte Argon2id result with HKDF purpose 2 and encrypt the raw 32-byte ORK. The ciphertext is therefore exactly 48 bytes. Production must benchmark this call in a worker on the lowest supported phone and desktop, but must not silently lower parameters. An explicitly reviewed future KDF profile creates a new slot while retaining the old slot until successful unlock and verification.

### Recovery slot

Generate a recovery secret as 32 random bytes and display/export only:

```text
EFR1.<RFC4648-base64url-without-padding(secret)>
```

The encoded secret is exactly 43 base64url characters after `EFR1.`. Reject whitespace, padding, non-alphabet characters, non-canonical pad bits, wrong prefix, or a decoded length other than 32. RFC 4648 defines base64url and permits omitted padding when the referring format says so ([RFC 4648, sections 3.2, 3.3, and 5](https://www.rfc-editor.org/rfc/rfc4648.html)). A wrong but well-formed secret is reported only as a failed unlock after AEAD verification; do not leak a separate verifier that enables cheaper guessing.

The header for kind 2 is:

```text
[organizationId:uuid, slotId:uuid, orkId:uuid,
 recoveryKdf=1:u8, nonce:bstr24]
```

Use the decoded 32-byte secret as HKDF input with purpose 3 and encrypt the raw ORK. Ciphertext is exactly 48 bytes. Recovery is independently usable on a new browser and therefore meets the multi-device constraint without making an enrolled device the root ([ADR 0017](../adr/0017-support-multiple-devices-without-a-single-device-root.md)). Authentication may authorize fetching the slot, but neither the login password nor authentication session derives this key ([ADR 0015](../adr/0015-keep-protected-text-unlock-independent-from-authentication.md)).

### OCK wrapper

The kind 3 header is:

```text
[organizationId:uuid, orkId:uuid, ockId:uuid, ockEpoch:u32,
 nonce:bstr24]
```

Derive the wrapping key from the ORK with HKDF purpose 1 and `aggregateId=ockId`, then encrypt the raw 32-byte OCK. Ciphertext is exactly 48 bytes. The authenticated header binds both key IDs and epoch, preventing wrappers from being transplanted between organizations or key records.

All kind 1–3 nonces are independent random 24-byte values. Libsodium explicitly permits random XChaCha nonces. A database uniqueness constraint on `(wrapping-key-id, nonce)` remains cheap defense in depth.

## Public client epochs, nonces, clocks, and signatures

Each unlocked browser context generates an Ed25519 key pair, a random `clientEpochId` UUID, and a random 16-byte `noncePrefix`. It registers this public record over the already authenticated and authorized connection:

```text
[registrationFormat=1, organizationId:uuid, clientEpochId:uuid,
 authenticatedUserId:uuid, noncePrefix:bstr16, signingPublicKey:bstr32]
```

The server rejects reuse of a client-epoch ID or nonce prefix within an organization. The private signing key and counters exist only in the Protected-text unlock session's memory; reload creates a new epoch. Revocation stops future writes from the epoch but does not invalidate historic signatures. A signature identifies the registered browser epoch and authenticated user; it does not prove a device identity independent of ElderFlow's server.

For every derived AEAD key context, its counter starts at 1 and may never repeat. The 24-byte nonce is exactly:

```text
noncePrefix (16 bytes) || counter (u64 big-endian)
```

Counters are separate for each `(clientEpochId, purpose, aggregateId)` because those tuples derive different AEAD keys. Retries reuse the complete original envelope byte-for-byte; they never encrypt again with the same counter. Counter exhaustion, storage rollback, or uncertainty destroys the epoch and creates a fresh random epoch before another encryption.

This construction lets independent clients start at counter 1 safely: their 128-bit random prefixes separate their nonce spaces. It also avoids Secsync's prototype ambiguity between public author clocks and random nonces while preserving the useful author-separation result in the local [prototype evidence](../../backend/src/collaboration/opaque-meeting-protocol.prototype/EVIDENCE.md).

## Encrypted scalar format and last-write-wins

The kind 4 header is:

```text
[organizationId:uuid, aggregateType:u16, recordId:uuid, fieldId:u16,
 ockId:uuid, clientEpochId:uuid, writeCounter:u64, nonce:bstr24]
```

The derived purpose-10 key is scoped to `recordId || u16be(fieldId)`. Plaintext is deterministic CBOR before padding:

```text
[scalarFormat=1, state, utf8Value:bstr, randomPadding:bstr]
```

`state=0` means domain null and requires an empty `utf8Value`; `state=1` means a value and permits an empty UTF-8 value. Other states are rejected. Fill `randomPadding` so the complete deterministically encoded plaintext is exactly the smallest fitting bucket in:

```text
256, 1024, 4096, 16384, 65536, 262144, 1048576 bytes
```

Padding bytes are cryptographically random. The encoder increases or decreases padding until the final CBOR length equals the bucket because the byte-string length header itself changes at CBOR length boundaries. A field row and envelope must exist even when its semantic value is null. Thus null and empty are indistinguishable from each other and from other values fitting the 256-byte bucket; the server still learns the selected size bucket and write timing.

The maximum scalar plaintext (including framing and padding) is 1,048,576 bytes and maximum ciphertext is 1,048,592 bytes. Oversize user input is rejected before encryption with a field-specific validation error.

The backend stores an unsigned 64-bit `commitRevision` beside the envelope and increments it transactionally whenever a new envelope wins. That server value is deliberately absent from the encrypted header: the client cannot authenticate a sequence that the server assigns only after receiving ciphertext. Scalar behavior remains server-commit-order last-write-wins. An exact retry identified by `(clientEpochId, recordId, fieldId, writeCounter)` and identical envelope hash returns its original result without incrementing the revision; the same identity with different bytes is rejected as counter reuse. An older retry cannot overwrite a newer value after its idempotency identity has already committed.

This keeps three different concepts separate: `envelopeFormat`/`cryptoSuite` describe how bytes are protected, `writeCounter` prevents per-writer replay/nonce reuse, and `commitRevision` decides application concurrency.

## Meeting collaboration formats

The local prototype established one Yjs document per Meeting, stable semantic fragments, encrypted transient awareness, opaque client-created snapshots, a compare-and-swap compaction race, and a hard completion write gate ([prototype README](../../backend/src/collaboration/opaque-meeting-protocol.prototype/README.md), [prototype evidence](../../backend/src/collaboration/opaque-meeting-protocol.prototype/EVIDENCE.md)). Production should preserve those boundaries while replacing Secsync envelopes.

Yjs documents updates as binary `Uint8Array` values that are commutative and idempotent. Its maintained source says V1 is default while V2 offers better compression and is available to custom providers, with explicit V1/V2 conversion functions ([Yjs document-update API](https://github.com/yjs/yjs#document-updates)). ElderFlow owns a custom provider and the prototype exercised V2, so `meetingCodec=2` means raw output from `encodeStateAsUpdateV2`/the `updateV2` event and input to `applyUpdateV2`. Each ElderFlow release pins one exact supported Yjs patch in its manifest—initial prototype evidence used `yjs@13.6.32`—and cross-patch byte/state compatibility is tested before changing that pin. The Yjs security policy currently supports 13.6.x ([Yjs security policy](https://github.com/yjs/yjs/blob/main/SECURITY.md)). A Yjs major or codec change is a document-codec migration, not a cryptographic-suite change.

### Binary transport frames

WebSocket messages are binary deterministic CBOR, never JSON or base64. Each complete message is:

```text
[wireFormat=1, frameType:u8, requestId:uuid-or-null, payload]
```

The exact v1 frame registry is:

| Type | Name | Payload |
| --- | --- | --- |
| 0 | `hello` | `[ticket:bstr32, documentId:uuid, envelopeFormats:[u8...], cryptoSuites:[u8...], meetingCodecs:[u8...], awarenessCodecs:[u8...], maxUpdateCiphertext:u32, maxAwarenessCiphertext:u16]` |
| 1 | `welcome` | `[envelopeFormat:u8, cryptoSuite:u8, meetingCodec:u8, awarenessCodec:u8, activeSnapshotId:uuid, currentServerSequence:u64]` |
| 2 | `submit-update` | kind-5 envelope |
| 3 | `update-result` | `[status:u8, envelopeHash:bstr32, serverSequence:u64-or-null, errorCode:tstr-or-null]` |
| 4 | `broadcast-update` | `[serverSequence:u64, kind-5-envelope]` |
| 5 | `awareness` | kind-7 envelope |
| 6 | `snapshot-changed` | `[snapshotId:uuid, parentSnapshotId:uuid, coveredServerSequence:u64]` |
| 7 | `meeting-closed` | `[finalServerSequence:u64]` |
| 8 | `protocol-error` | `[errorCode:tstr]` |

`requestId` is required for client requests (types 0, 2, and 5) and null for broadcasts. `status` is `1=accepted`, `2=exact duplicate`, or `3=rejected`. Error codes are ASCII, at most 64 bytes, and contain no Protected text. Arrays of supported versions are strictly increasing and duplicate-free. The server consumes the random, document-bound, 30-second, single-use collaboration ticket in type 0 before accepting any other frame; neither ticket nor document ID appears in the WebSocket URL, preserving the local prototype's authenticated-transport decision ([prototype evidence](../../backend/src/collaboration/opaque-meeting-protocol.prototype/EVIDENCE.md)).

The maximum complete encoded type-2 frame is 1,050,000 bytes and type-5 frame is 4,608 bytes. Key wrappers, encrypted scalars, and snapshots use authenticated binary HTTP with media type `application/vnd.elderflow.e2ee+cbor;v=1`; maximum complete bodies are respectively 1,024, 1,050,000, and 16,800,000 bytes. Responses use the same media type. The backend never embeds these envelopes in ordinary JSON or writes them to application logs.

### Update

The kind 5 header is:

```text
[organizationId:uuid, documentId:uuid, activeSnapshotId:uuid,
 ockId:uuid, meetingCodec=2:u8, clientEpochId:uuid,
 authorClock:u64, nonce:bstr24]
```

Plaintext is the raw single Yjs V2 update. Derive purpose 20 for the document. `authorClock` is the nonce counter and is strictly sequential per `(documentId, clientEpochId)` across accepted updates. The relay requires exactly the last accepted clock plus one, except an identical retry of the last accepted envelope. It verifies the signature, current snapshot ID, authorized write role, Meeting write gate, OCK write policy, size, and clock before assigning an unsigned 64-bit `serverSequence` in its database transaction.

`serverSequence` is relay order and completion serialization, not edit concurrency and not signed cryptographic metadata. Yjs's own encrypted internal client IDs/state vectors resolve concurrent edits. Recipients may receive different authors out of order; they verify/decrypt independently but buffer a gap in one author's public clocks until the missing envelope arrives or a snapshot reload is required.

Maximum update plaintext is 1,048,576 bytes and ciphertext 1,048,592 bytes. Updates travel as binary WebSocket frames. The relay rejects oversize frames before CBOR parsing. Because Yjs warns that crafted or very large updates can corrupt or exhaust peers and does not treat authorized writers as cryptographically trustworthy, only authorized Content users may write; clients must apply updates in a worker where practical, cap nesting/editor schema, and fuzz the pinned decoder ([Yjs threat model](https://github.com/yjs/yjs/blob/main/THREAT_MODEL.md)).

### Client snapshot and compaction

The kind 6 header is:

```text
[organizationId:uuid, documentId:uuid, snapshotId:uuid,
 parentSnapshotId:uuid, parentEnvelopeHash:bstr32,
 coveredServerSequence:u64,
 coveredAuthorClocks:[[clientEpochId:uuid, authorClock:u64], ...],
 ockId:uuid, meetingCodec=2:u8, clientEpochId:uuid,
 snapshotClock:u64, nonce:bstr24]
```

`coveredAuthorClocks` is sorted by raw client-epoch UUID and contains exactly one entry for every author in the active chain. `parentEnvelopeHash` is SHA-256 of the parent's complete deterministic-CBOR envelope. Plaintext is `Y.encodeStateAsUpdateV2(document)`, not a Yjs historical `Snapshot` object. Derive purpose 21. `snapshotClock` is the nonce counter for the snapshot purpose/context and is independent from update `authorClock`.

The relay accepts a proposal only when all of these still match current state in one transaction: active parent ID and hash, current highest server sequence, and the relay's exact per-author public clock vector. It verifies authorization, signature, current/readable OCK policy, codec, and sizes, then atomically makes the snapshot active and starts a new empty update chain. A concurrent proposal loses the compare-and-swap and reloads. These checks establish structural coverage of envelopes the opaque relay has seen; they cannot prove a malicious writer incorporated the correct decrypted Yjs state.

Maximum snapshot plaintext is 16,777,216 bytes and ciphertext 16,777,232 bytes. Upload snapshots through authenticated binary HTTP, not the latency-sensitive update WebSocket. Retain the superseded snapshot and covered update envelopes for at least 30 days and through one verified backup cycle. Delete them only after that window and after no active client references the parent. This provides a bounded corruption rollback and key-migration grace period without making old ciphertext part of the active chain.

Meeting completion transactionally closes the relay write gate at one `serverSequence`. Envelopes committed through that sequence belong to the Meeting; later or disconnected updates are rejected. The client destroys its divergent Yjs/plaintext state and reloads the canonical Completed Meeting snapshot, exposing only a content-free discarded-change notice, as validated by the prototype and required by completed-Meeting immutability ([ADR 0010](../adr/0010-make-completed-meetings-immutable.md)).

### Awareness

The kind 7 header is:

```text
[organizationId:uuid, documentId:uuid, ockId:uuid,
 awarenessCodec=1:u8, clientEpochId:uuid,
 awarenessClock:u64, nonce:bstr24]
```

Plaintext is:

```text
[awarenessFormat=1,
 displayName:tstr, stableFragmentId:tstr,
 anchorRelativePosition:bstr-or-null,
 headRelativePosition:bstr-or-null]
```

Names are at most 128 UTF-8 bytes, fragment IDs 256 bytes, and each position 512 bytes. Positions use the pinned Yjs relative-position encoder, not absolute character indexes. Derive purpose 22. The signed `awarenessClock` is its nonce counter. The relay keeps only the greatest clock seen per active epoch, drops duplicates/older frames, broadcasts to authorized readers, never persists the envelope, and expires state after 30 seconds or disconnect. Maximum plaintext is 4,096 bytes and ciphertext 4,112 bytes.

## Format negotiation and rejection

The first authenticated collaboration frame advertises arrays of supported `envelopeFormat`, `cryptoSuite`, `meetingCodec`, and `awarenessCodec` values plus maximum receive sizes. The server replies with the intersection and the document's required readable values. Negotiation chooses what a client may read/write; it never changes stored bytes and never selects a lower version merely because it appears first.

Every REST and WebSocket write still carries its self-describing envelope. The server enforces an allowlist for kind/version/suite/codec, exact array length and field types, known client epoch, signature, size cap, organization/object binding, key write status, and state gate before persistence. Unknown or disabled values return stable language-neutral errors such as `E2EE_FORMAT_UNSUPPORTED`, `E2EE_SUITE_UNSUPPORTED`, `E2EE_KEY_NOT_WRITABLE`, or `E2EE_CODEC_UNSUPPORTED`; bytes are not persisted or broadcast. This follows ElderFlow's existing language-neutral backend-error boundary ([ADR 0002](../adr/0002-return-language-neutral-api-errors.md)).

A client may join an active document only if it can read the active snapshot and every OCK/format still referenced by the active chain. A client opening immutable history must support every OCK/format referenced by that frozen record. There is no server-side crypto or codec transcoding. Read-only structural access does not imply ciphertext delivery: the backend permission map remains authoritative and IT admins never receive protected envelopes or the unlock flow.

## Replay, corruption, and recovery behavior

The opaque relay and unlocked client have deliberately different validation pipelines:

- **Relay, before persistence/broadcast:** check encoded size and CBOR framing; public version/kind/header schema and canonical encoding; authorization, Meeting state, and public key-write policy; client registration and signature for signed kinds; then replay identity/clock. The relay cannot AEAD-open, validate decrypted scalar/awareness schema, or parse/apply Yjs.
- **Unlocked client, before exposing/applying content:** check encoded size and canonical public schema; registered signing key and signature; expected object/key/counter context; AEAD open; decrypted plaintext schema and UTF-8; then, for collaborative content, bounded Yjs decode/application. No plaintext or document mutation is visible before all preceding checks succeed.

- Exact retries return the prior outcome and never re-encrypt or advance revisions/sequences.
- The same client/context/counter with a different envelope hash is `E2EE_COUNTER_REUSE`; lower clocks are `E2EE_REPLAY`; update clock gaps are `E2EE_AUTHOR_CLOCK_GAP` and trigger missing-envelope fetch. Awareness gaps are allowed because frames are ephemeral.
- Signature failure is rejected by the relay and logged without ciphertext bytes. AEAD failure is detected by clients; no plaintext or Yjs mutation is exposed before successful authentication.
- On a scalar AEAD/schema failure, display a localized unavailable/corrupted state, preserve the ciphertext for diagnosis, and do not replace it with null/empty or autosave over it.
- On an update failure, quarantine the envelope, refetch that exact server sequence once, then reload from the newest decryptable retained snapshot and chain. Never partially apply a failed envelope.
- On an active snapshot failure, try the retained parent plus its covered chain. If that succeeds, suspend writes and request authorized client compaction; if not, mark the document unavailable for repair. The server must not guess which ciphertext is correct.
- A signature only proves which registered writer epoch created bytes. The Yjs project explicitly says authorized malicious peers can make destructive valid updates; ElderFlow's role authorization, size limits, pinned dependency, schema restrictions, and decoder fuzzing are therefore mandatory and signatures are not described as malicious-content prevention ([Yjs threat model](https://github.com/yjs/yjs/blob/main/THREAT_MODEL.md)).

## Rotation, upgrades, and gradual re-encryption

All migrations use `read-old/write-new`; never mutate an envelope in place.

1. **Shared-passphrase rotation:** while unlocked, create and verify a new kind-1 slot wrapping the same ORK, atomically mark it current, then retire the old slot after the recovery slot is also verified. No OCK or content ciphertext changes.
2. **Recovery-secret rotation:** create and verify a new kind-2 slot for the same ORK, atomically activate it, then delete the old slot only after the new secret has been acknowledged as stored. No content changes.
3. **ORK rotation:** generate a new random ORK and new unlock slots; unwrap each readable OCK locally and create a kind-3 wrapper under the new ORK. After every referenced OCK has a verified new wrapper, atomically activate the new ORK. Content ciphertext does not change. Retain the old wrappers for the 30-day/backup rollback window.
4. **OCK rotation:** generate a new random OCK/ID/epoch, wrap it with the current ORK, make new mutable scalar writes, active-Meeting updates/snapshots, and awareness use it, and retain old OCK wrappers for reading. Accept already-encrypted transient Meeting updates under the immediately previous OCK for seven days; after that return `E2EE_KEY_NOT_WRITABLE`, letting an unlocked client decrypt and reseal the uncommitted raw Yjs update with the current OCK and the still-unaccepted author clock. Background authorized clients may rewrite only mutable scalar records, in server commit order, after comparing the source envelope hash. Active Meeting chains shed old OCK references at the next accepted snapshot. Completed Meeting envelopes and other frozen encrypted snapshots are never rewritten: the backend cannot verify that client-authored replacement ciphertext preserves the immutable plaintext. Their referenced OCK wrappers therefore remain readable, potentially indefinitely. Delete an old OCK wrapper only when a database reference scan reports zero mutable, active, retained, **and immutable** envelope references and the last mutable replacement has survived 30 days and one backup cycle.
5. **Envelope/suite/codec upgrade:** deploy dual readers first, then advertise/write the new value, then migrate mutable scalars and active Meeting snapshots with the same compare-and-swap rules. A Yjs codec migration for an active Meeting decrypts into the exactly pinned Yjs document and emits a new full-state snapshot tagged with the new codec; it does not pretend the crypto suite changed. Completed Meetings and frozen scalar snapshots remain byte-for-byte unchanged under their original suite/format/codec. Retain their readers and OCK wrappers for as long as any immutable reference exists. Rewriting immutable envelopes requires a separate future archival-migration design with a backend-verifiable preservation rule; ordinary client re-encryption is not such a rule.
6. **Passphrase KDF-cost upgrade:** create a new slot with its explicit future KDF profile after a successful old-slot unlock. Never reinterpret old `opslimit`/`memlimit` using newer constants; libsodium specifically requires stored parameters for deterministic derivation ([libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf)).

The first encrypted release may reset development data, but these version/key identifiers and migrations are still required for all later production changes ([ADR 0018](../adr/0018-reset-development-content-for-the-first-encrypted-release.md)).

## Required deterministic test-vector dossier

Before implementation is accepted, commit machine-readable JSON vector fixtures plus a human-readable generated appendix. JSON represents every byte string as lowercase hex; integers are decimal strings when they can exceed JavaScript's safe integer range. Vector generation must use fixed inputs—never a live random source—and record the exact libsodium, libsodium.js, CBOR, Yjs, Node, and browser versions.

Each positive vector contains:

1. all source bytes (ORK, OCK, passphrase UTF-8, recovery secret, salts, UUIDs, Ed25519 seed, nonce prefix, counter, plaintext, and fixed padding);
2. deterministic CBOR header hex and AEAD-associated-data hex;
3. HKDF salt/info and every intermediate derived 32-byte key;
4. nonce hex, ciphertext hex, signed-message hex, public key, signature, and complete envelope hex;
5. decoded semantic value or SHA-256 of the resulting Yjs state; and
6. expected server replay identity, revision/sequence behavior, and error for negative variants.

At minimum the suite must include:

- RFC 5869 published HKDF-SHA-256 vectors and RFC 8032 Ed25519 vectors unchanged, proving primitive interoperability before ElderFlow composition vectors ([RFC 5869 test vectors](https://www.rfc-editor.org/rfc/rfc5869.html#appendix-A), [RFC 8032 test vectors](https://www.rfc-editor.org/rfc/rfc8032.html#section-7));
- one shared-passphrase slot, one recovery slot, one OCK wrapper, and one deliberately wrong passphrase/recovery secret;
- scalar null, empty string, non-ASCII NFC text, the 256-byte bucket boundary, every CBOR-length boundary affected by padding, maximum accepted size, and one-byte-too-large rejection;
- two client epochs both using counter 1 under the same OCK/document and proving distinct nonces/ciphertexts;
- an update, snapshot, and awareness envelope produced in browser and verified in Node, then produced in Node reference code and verified in at least Chromium, Firefox, and WebKit;
- two concurrent Yjs clients whose encrypted update delivery is permuted and duplicated but whose decrypted document hashes converge; Yjs documents updates as commutative/idempotent, so this tests ElderFlow's envelope ordering without substituting it for CRDT concurrency ([Yjs update API](https://github.com/yjs/yjs#document-updates));
- compaction coverage vector sorting, parent-hash tampering, stale-parent race, omitted author clock, and covered-server-sequence mismatch;
- one-bit mutations of every header field, nonce, ciphertext, signature, and trailing CBOR byte; non-shortest CBOR integers; indefinite lengths; malformed UTF-8; unknown version/suite/kind/codec; and each exact size-cap rejection;
- exact retry, lower-clock replay, same-clock/different-ciphertext, clock gap, ephemeral awareness reordering, completed-Meeting late update, and retired-key write;
- passphrase, ORK, OCK, suite, envelope, and Yjs codec upgrade fixtures that prove old-read/new-write and prove no key is removed while referenced; and
- a frozen Yjs V2 fixture from the five-fragment prototype, with expected rendered fragment values and a state hash after reload/compaction.

The test harness must compare complete bytes, not base64 strings or decoded objects, and must fail if re-encoding accepted input changes any authenticated byte. Primitive vectors should also be run directly against the pinned libsodium.js wrapper and a native/reference implementation. This is the evidence required to turn the format decision into a reviewable production protocol; the disposable prototype itself explicitly did not establish cryptographic review ([prototype evidence](../../backend/src/collaboration/opaque-meeting-protocol.prototype/EVIDENCE.md)).

### Worked v1 recovery-wrapper vector

This composition vector was generated with Node's RFC 5869 HKDF-SHA-256 and `libsodium-wrappers@0.7.16`; it must be independently reproduced by the eventual pinned browser and native/reference harness before becoming a release gate.

```text
organizationId = 00000000000040008000000000000001
slotId         = 00000000000040008000000000000002
orkId          = 00000000000040008000000000000003
recoverySecret = 000102030405060708090a0b0c0d0e0f
                 101112131415161718191a1b1c1d1e1f
recoveryText   = EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
ORK             = 202122232425262728292a2b2c2d2e2f
                 303132333435363738393a3b3c3d3e3f
nonce           = 404142434445464748494a4b4c4d4e4f
                 5051525354555657

HKDF info CBOR  = 8470456c646572466c6f77206b657920763103005000000000000040008000000000000002
derived key     = 4efeeaaa44df51d51c43642c938a530ac620e1924bee325da7bab8d2037ba35e
AEAD AAD CBOR   = 8401020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f5051525354555657
ciphertext      = 9e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5
envelope CBOR   = 8601020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f505152535455565758309e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5f6
```

The HKDF `info` decodes to `["ElderFlow key v1", 3, 0, slotId]`; the AAD decodes to `[1, 2, 1, header]`; and the final `f6` is CBOR `null` for the unsigned key-wrapper signature field. Flipping any source byte must either derive a different key or fail authenticated decryption; non-canonical encodings of the same decoded arrays must be rejected before use.

## Explicit limitations

- Bucket padding hides null versus empty and coarse lengths only; timing, record existence, write frequency, aggregate IDs, OCK IDs, client epochs, authors, Meeting structure, and ciphertext buckets remain server-readable metadata.
- Ed25519 signatures and public clock vectors detect corruption/replay attributable to registered epochs under the honest-but-curious infrastructure model. They do not protect against a maliciously modified web client, compromised endpoint, malicious authorized writer, or server omission/fork attacks. Those boundaries are consistent with the adopted threat model ([ADR 0012](../adr/0012-limit-e2ee-threat-model-to-storage-and-passive-infrastructure-access.md)).
- JavaScript cannot guarantee perfect secret erasure. Use workers, short-lived `Uint8Array`s, libsodium `memzero`, no serialization/logging, and destroy the unlock context on lock, while documenting this browser limitation.
- Durable offline key storage and offline login remain excluded; the nonce/client-epoch design supports transient disconnect queues held by an already unlocked context ([ADR 0014](../adr/0014-support-transient-disconnects-without-offline-first-key-storage.md)).

## Production dependency boundary

Use Secsync only as prior design evidence. Implement these ElderFlow envelopes around a pinned, integrity-checked `libsodium-wrappers-sumo` and pinned supported Yjs/Tiptap versions; keep all CRDT and decryption work in authorized unlocked clients and relay only bounded public metadata plus ciphertext. This follows the prototype verdict and the open-source/self-hosted requirement ([prototype evidence](../../backend/src/collaboration/opaque-meeting-protocol.prototype/EVIDENCE.md), [ADR 0013](../adr/0013-require-open-source-self-hosted-collaboration-and-encryption.md)).
