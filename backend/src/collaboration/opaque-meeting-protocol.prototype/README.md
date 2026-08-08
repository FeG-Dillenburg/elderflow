# PROTOTYPE: opaque encrypted Meeting-document protocol

This disposable logic lab asks whether ElderFlow can preserve its Meeting-document and completion boundaries with real Yjs updates inside real Secsync `0.5.0` cryptographic envelopes while a NestJS-shaped relay sees only routing, authorization, ordering, and ciphertext metadata.

Run it from the repository root:

```sh
pnpm prototype:opaque-meeting
```

Run the deterministic gate drill and print the final state:

```sh
pnpm prototype:opaque-meeting -- --drill
```

The lab deliberately has no database, durable key storage, tests, or production abstractions. It models the protocol seam, not a deployable implementation. The relay never receives the document key. Four independent clients exercise Content-user writes, read-only access, and `it-admin` exclusion. The deterministic drill also mounts the currently published MIT Tiptap collaboration extension against five stable fragments in one Yjs document and verifies a full-state round trip.

## What to react to

The completion drill implements the validated hard boundary: the completion transaction closes the relay write gate; any disconnected update arriving afterward is rejected and discarded by that client. The client tears down its divergent in-memory Yjs document and reloads the canonical Completed Meeting snapshot, so the rejected plaintext disappears as well as its queued ciphertext. The client exposes a content-free discarded-update outcome so the loss is observable without retaining Protected text or ciphertext for later upload.

The dynamic-appearance drill treats the structural row plus initial encrypted fragment update as one idempotent mutation. The client prepares ciphertext first; the server commits both or neither. A stable appearance ID is therefore available before the Yjs fragment is created.

The compaction drill accepts the first snapshot whose parent is still active. A concurrent snapshot based on the former parent loses the race and must reload. Superseded ciphertext retention is intentionally not modeled because the later rotation/recovery decision owns that policy.
