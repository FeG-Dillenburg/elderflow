# Encrypted Meeting collaboration evidence

Issue #52 adds a 30-second, random, document-bound ticket stored only as a SHA-256 hash, consumed once in a PostgreSQL transaction, and sent in the first frame on `/api/meetings/collaboration`. The URL contains no credential. The relay reuses the existing signed kind-5 envelope validator and server sequence transaction; it broadcasts ciphertext and separately encrypted ephemeral awareness without constructing a Yjs document.

Client edits are captured as Yjs Update V2 bytes, immediately sealed by the existing Meeting document codec, and only encrypted envelopes enter the volatile reconnect queue. Completion remains the database serialization boundary. A late update receives `MEETING_COMPLETED_IMMUTABLE`; the client clears pending envelopes, destroys divergent state, and exposes a localized discarded-change status.

Verification commands:

```sh
pnpm --filter @elderflow/backend test
pnpm --filter @elderflow/frontend test
pnpm build
```

Focused evidence is in `meetings.controller.spec.ts`, `1720000016000-MeetingCollaboration.spec.ts`, `meeting-document-codec.spec.ts`, `meeting-document-session.spec.ts`, and `RichTextEditor.spec.ts`. The rich-text fixture reconstructs bold, italic, underline, foreground/background color, block quote, ordered/unordered lists, and links from a collaborative fragment after reload. Catalog parity and view suites cover localized status and accessible editor controls.

Running-instance marker check: use two separately unlocked browser contexts, edit different fragments concurrently, disconnect one context, edit again, reconnect, and confirm convergence. Complete the Meeting while the second context is disconnected, then reconnect and confirm the late ciphertext is rejected and visibly discarded. Inspect PostgreSQL, WebSocket frames, browser storage/cache, URLs, and backend logs for the chosen plaintext marker; only ciphertext, structural IDs, sequence/length/version/outcome metadata, and fingerprints may appear.
