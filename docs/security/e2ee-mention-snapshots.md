# Encrypted mention snapshots (#99)

## Numeric registry

These scalar contexts extend the existing signed purpose-10 scalar envelope; assigned numbers must never be reused.

| Aggregate | ID | Field | Field ID | Record identity |
| --- | ---: | --- | ---: | --- |
| Mention snapshot | 260 | Captured context | 1 | Completion-scoped occurrence UUID |
| Completion | 261 | Finalization proof | 1 | Barrier UUID |
| Completion | 261 | Prepare proof | 2 | Meeting UUID |

Prepare uses field 2 so its scalar-write ledger key cannot collide with a Meeting title write (Meeting UUID / field 1). Contexts and mention labels are encrypted using the existing padding, signature, nonce-counter, historical-key, and recovery conventions. No new key derivation or re-encryption of existing content is introduced.

The occurrence UUID is a standard UUIDv5 using the barrier UUID as namespace and the UTF-8 JSON array `[appearanceId, userId, occurrence]` as its name. It is a deterministic context identifier, not a new encryption primitive. The server recomputes it before accepting the signed envelope. This binds its public record context to the completion claim, appearance, recipient, and sentence occurrence. The ciphertext additionally carries the Meeting, document, sequence, appearance, and readable context. Readers check its Meeting and appearance against the response. Topic names reuse their existing encrypted completion snapshots.

## Completion protocol

1. An unlocked browser sends a signed prepare proof. The API verifies completion permissions and an active author epoch before opening the existing five-second multi-collaborator drain barrier.
2. Every connected client drains pending writes and observes the authoritative document sequence. Prepare returns the barrier UUID, document UUID, and sequence after all participants confirm it.
3. The barrier remains frozen in a separate finalizing phase, bounded to 30 seconds including submission and persistence. The browser reads the frozen agenda and structured document, extracts Person Meeting topic notes or other types' Meeting-minutes text, encrypts contexts, and submits every appearance, including empty results, with a signed claim proof.
4. The API verifies claim ownership, stable sequence, document/appearance ownership, eligible recipients, envelope signatures/contexts, and author epochs. One transaction records mention rows, explicit capture markers, Topic snapshots, the completed sequence, and Meeting completion. The author epoch and claim are checked again before commit.
5. Failure, cancellation, timeout, or collaborator disconnect releases the barrier. A disconnect during the database transaction invalidates the claim while keeping writes frozen until rollback. Deadline expiry releases the barrier even if the request is waiting for a database connection; Meeting-row locks serialize concurrent document writes, and claim checks at transaction entry, during persistence, and immediately before commit force an expired transaction to roll back. Connected clients resume their pending edits. Completed snapshots are never replaced or backfilled.

Browser lock closes collaboration and revokes its epoch. The server can validate cryptographic possession and observed revocation/disconnection, but cannot inspect plaintext or prove semantic completeness of extraction. Neither a frontend flag nor a signed empty snapshot proves that all mentions were extracted. As with other authenticated writes, a commit already accepted before a lock/revocation reaches the server cannot be retroactively undone.

## Current mentions and access

Each completed appearance explicitly records whether mention capture ran; legacy completed appearances retain `false`. The current query selects rows only from the latest completed appearance for that Topic ordered by `(Meeting date, begin time, Meeting UUID)`. The absence of rows on that appearance suppresses all older rows. Other Topics remain untouched. The normalized historical rows are immutable through the completed-Meeting boundary and retained by restrictive foreign keys.

The API filters recipients by the authenticated UUID and uses the existing Protected-text and Topic/Meeting access policies. Guest and IT-admin users receive no ciphertext under the current E2EE policy. Mentioning a UUID grants no new access. Responses are `no-store`; plaintext exists only in the unlocked browser and is cleared from My mentions on lock or navigation. No notification transport, new Task records, or completion controls are introduced.

## Verification

- Editor tests cover structured identity, typed resolution, boundaries, accessible suggestions, viewer-dependent styling, Yjs transfer, and sanitized copy/paste.
- Extraction tests cover sentence context, title abbreviations, repeated occurrences, block boundaries, all Topic types, and excluded fields.
- Browser integration uses real encrypted document sessions and a simulated transport to deliver a peer's final edit during drain, verifies encrypted extraction at the confirmed sequence, and aborts when keys lock before submission.
- PostgreSQL integration covers populated-schema upgrades, chronological replacement/clearing and UUID ties, per-user access, historical retention, transactional rollback, invalid crypto/context/epoch submissions, and disconnect during commit.
