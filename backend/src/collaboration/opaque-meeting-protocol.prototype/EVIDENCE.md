# Prototype evidence and verdict

Captured on 2026-08-08 for the Wayfinder ticket “Prototype the opaque encrypted Meeting-document protocol.” This is disposable prototype evidence, not a production security claim.

## Dependency boundary

The runnable lockfile pins:

- `yjs@13.6.32` — MIT; Node 16+.
- `@tiptap/core@3.29.2`, `@tiptap/starter-kit@3.29.2`, and `@tiptap/extension-collaboration@3.29.2` — MIT. The collaboration extension's published peers are `yjs`, `@tiptap/core`, `@tiptap/pm`, and `@tiptap/y-tiptap`.
- `secsync@0.5.0` and `secsync-server@0.5.0` — repository Apache-2.0. The npm manifests do not declare a `license` field and the packages do not ship a license file; production compliance would need to retain the repository license explicitly.
- `libsodium-wrappers@0.7.16` — Secsync's cryptographic runtime.

No package name in the lockfile begins with `@tiptap-pro/`. The prototype uses no Tiptap hosted service, cloud API, paid collaboration backend, or proprietary feature. The current open-source collaboration extension successfully mounted five independent editors against stable fragments in one Yjs document.

Primary package sources: [Tiptap repository](https://github.com/ueberdosis/tiptap), [Yjs repository](https://github.com/yjs/yjs), and [Secsync repository and Apache-2.0 license](https://github.com/nikgraf/secsync).

## Secsync integration comparison

### Direct package use: reject

Published `secsync@0.5.0` constructs the browser WebSocket URL as `<endpoint>/<document>?sessionKey=<credential>...`. Published `secsync-server@0.5.0` parses that query credential and retains it in its process-global room registry. This fails ElderFlow's requirement that credentials not enter URL/infrastructure logs. It also does not directly fit NestJS ownership of authentication, authorization, lifecycle, and PostgreSQL transactions.

The package remains beta at `0.5.0`; the repository is not archived, but its default branch was last pushed on 2024-09-21. The prototype verified useful envelope primitives, author clocks, signatures, snapshot ancestry, and encrypted update behavior, but it did not establish the upstream state machine as a production-supported dependency.

### Narrow maintained fork: reject as the production boundary

A fork could replace query authentication and the process-global connection registry, but those changes cut across both client connection construction and server connection handling. ElderFlow would then own an approximately 2,900-line bundled state machine/relay whose document-integrity guarantees upstream itself does not claim to have proven. That is not meaningfully narrower or easier to review than owning ElderFlow's smaller required protocol surface.

### Implement the required protocol concepts: recommend, subject to security review

Use Secsync as a design and test-vector source, not as the production runtime boundary. Specify and implement only ElderFlow's versioned snapshot, update, ephemeral-awareness, author-clock, signature, and ancestry concepts using a reviewed libsodium binding. Keep all CRDT processing in the unlocked client and all relay logic structural and ciphertext-only. The security dossier must review the construction and include deterministic cross-client vectors before production approval; the successful prototype is not that approval.

## Authenticated WebSocket boundary

The current app authenticates ordinary requests with a bearer session stored by the browser. Browser WebSockets cannot set an `Authorization` header. The prototype therefore uses this shape:

1. An authenticated same-origin REST request exchanges the existing bearer session for a random, document-bound, 30-second, single-use collaboration ticket.
2. The browser opens a stable same-origin `wss://<installation>/api/collaboration` URL with no credential or document identifier in its query string.
3. The ticket and document identifier are sent in the first TLS-protected application frame and must be consumed before any document frame is accepted.
4. The backend resolves the ticket to the current user, applies the existing Meeting permission map, excludes `it-admin`, and rechecks authorization for writes and broadcasts. Authorization loss closes the connection.

This remains independent from Protected-text unlock: the ticket authenticates and authorizes a connection but carries no document key.

## Validated completion boundary

Meeting completion is the hard serialization boundary. A ciphertext update committed before completion is part of the Meeting; a disconnected or in-flight update arriving after completion is rejected. On that rejection, the client discards the pending ciphertext, destroys the divergent plaintext/Yjs state, reloads the canonical encrypted Completed Meeting snapshot, and exposes only a content-free discarded-change outcome. There is no mandatory all-client flush barrier.

## Remaining limits

- The jsdom multi-editor probe establishes current Tiptap/Yjs compatibility, not real browser layout or mobile responsiveness.
- Node heap/load measurements are directional, not browser memory telemetry.
- The transport probe validates the authentication state model, not a production NestJS/WebSocket deployment.
- No independent cryptographic review, malicious-client integrity proof, or cross-browser deterministic vector suite has occurred yet; these belong in the required security review dossier and implementation plan.
