# Encrypted Meeting collaboration evidence

Issue #52 adds a 30-second, random, document-bound ticket stored only as a SHA-256 hash, consumed once in a PostgreSQL transaction, and sent in the first frame on `/api/meetings/collaboration`. The URL contains no credential. The relay reuses the existing signed kind-5 envelope validator and server sequence transaction; it broadcasts ciphertext and separately encrypted ephemeral awareness without constructing a Yjs document.

Client edits are captured as Yjs Update V2 bytes, immediately sealed by the existing Meeting document codec, and only encrypted envelopes enter the volatile reconnect queue. Completion remains the database serialization boundary. A late update receives `MEETING_COMPLETED_IMMUTABLE`; the client clears pending envelopes, destroys divergent state, and exposes a localized discarded-change status.

Issue #73 adds a five-second, document-scoped compaction barrier. The client whose acknowledged update crosses a 100-update boundary requests compaction even when later envelopes are already queued; the relay pauses every connected client, waits for already-encrypted envelopes to drain, and designates that requester only after PostgreSQL's server sequence is stable. Keystrokes made behind the barrier remain as plaintext Yjs deltas only in the unlocked browser session, while the designated client builds the snapshot from a frozen document that receives drained remote updates but excludes its own queued edits. The snapshot HTTP request carries the random barrier identifier, and the backend compares the signed snapshot sequence with both the barrier sequence and the locked Meeting document row before atomically replacing the active chain.

Timeout, participant disconnect, compactor failure, invalid authorization, and stale proposal paths release the barrier without changing the active snapshot. Once commit is claimed, bounded PostgreSQL lock and statement timeouts keep its database work finite, and the barrier is released only after the transaction outcome is known. Non-WebSocket document writes abort a draining barrier or are rejected while its commit is in progress. Clients then encrypt their queued deltas against the unchanged parent. After successful compaction, every client resynchronizes before encrypting those deltas against the new parent. If an old-parent envelope nevertheless reaches rejection, the browser registers a fresh client epoch and nonce prefix before resealing. Pending envelopes retain the epoch and signing-key identity needed to decrypt them after another provider rotates the shared session, and every epoch created by that unlock session is revoked when it locks, including an epoch whose registration races with lock.

The content-free control frames are:

| Direction | Frame | Fields |
| --- | --- | --- |
| Client → relay | `request-compaction` | `triggerServerSequence` |
| Relay → clients | `compaction-barrier` | `barrierId` |
| Client → relay | `compaction-drained` | `barrierId` |
| Relay → designated client | `compaction-ready` | `barrierId`, `serverSequence` |
| Designated client → relay | `compaction-failed` | `barrierId` |
| Relay → clients | `compaction-released` | `barrierId`, `outcome` (`compacted` or `aborted`) |

Verification commands:

```sh
pnpm --filter @elderflow/backend test
pnpm --filter @elderflow/frontend test
pnpm build
```

Focused evidence is in `meeting-collaboration-relay.service.spec.ts`, `meetings.controller.spec.ts`, `1720000016000-MeetingCollaboration.spec.ts`, `meeting-document-codec.spec.ts`, `meeting-document-session.spec.ts`, `meeting-collaboration.spec.ts`, and `RichTextEditor.spec.ts`. Deterministic two-provider tests cover plaintext queuing and release, while the running-instance evidence drives PostgreSQL through sequence 100, compacts, persists a second client's queued sequence-101 delta, and reloads it. The rich-text fixture reconstructs bold, italic, underline, foreground/background color, block quote, ordered/unordered lists, and links from a collaborative fragment after reload. Catalog parity and view suites cover localized paused/resynchronizing status and accessible editor controls.

Running-instance marker check: use two separately unlocked browser contexts, edit different fragments concurrently, disconnect one context, edit again, reconnect, and confirm convergence. Continue through sequence 100 while both contexts type, confirm paused text remains visible, and verify both contexts converge after `compaction-released`. Complete the Meeting while the second context is disconnected, then reconnect and confirm the late ciphertext is rejected and visibly discarded. Inspect PostgreSQL, WebSocket frames, browser storage/cache, URLs, and backend logs for the chosen plaintext marker; only ciphertext, structural IDs, barrier identifiers, sequence/length/version/outcome metadata, and fingerprints may appear.
