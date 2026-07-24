# Open-source encrypted collaboration architectures

## Executive conclusion

ElderFlow should keep **Tiptap and Yjs in the unlocked client**, but it should
not use an ordinary Hocuspocus or `y-websocket` server for Protected text.
Those servers participate in the Yjs synchronization protocol, materialize a
`Y.Doc`, and persist a merged Yjs state. That requires access to plaintext Yjs
updates.

The strongest fit found is a **Secsync-style opaque central relay**:

- a client turns each local Yjs update into an independently authenticated,
  encrypted, and signed message;
- the server authorizes the document structurally, sequences and persists
  ciphertext, and broadcasts ciphertext without applying Yjs updates;
- an authorized client periodically encrypts a full Yjs state as a snapshot;
- awareness is carried in encrypted, non-persistent messages;
- clients decrypt, verify, and apply updates locally.

Secsync demonstrates this design with Yjs and Tiptap and supplies reusable
CRDT-agnostic client and server packages. It is therefore the best starting
point for a prototype. It is **not ready to adopt uncritically**: its own README
calls it beta software, the latest repository commit inspected is from
September 2024, its package is version `0.5.0`, an open issue reports that its
examples are broken, and its security documentation explicitly says document
integrity has not yet been proven. No independent security audit was identified
in the upstream repository materials.

The recommended prototype is therefore:

1. Tiptap's MIT-licensed editor and collaboration extensions with Yjs in Vue.
2. The Secsync core protocol/client state machine, or a narrowly maintained
   fork of it, behind an ElderFlow-specific Vue adapter.
3. A NestJS/PostgreSQL opaque relay implemented through Secsync's server
   callbacks and ElderFlow's existing record authorization.
4. One collaborative Yjs document per Meeting, containing the collaborative
   long-form fields in that Meeting's preparation and active Agenda.

Production approval must wait for the key-management research, the prototype
questions listed below, protocol test vectors, and independent review using the
planned E2EE security review dossier.

## Scope and fixed constraints

This report answers the collaboration-architecture question. It assumes the
Wayfinder constraints already agreed for ElderFlow:

- Protected text must not be visible in the database, backups, backend logs, or
  to an honest-but-curious infrastructure administrator.
- A maliciously modified web client and a compromised user device are outside
  the threat model.
- Existing role authorization remains authoritative and unchanged; `it-admin`
  remains unable to access content or an Organization key.
- All components must be open source and self-hostable.
- Collaboration is initially limited to long-form fields in Meeting
  preparation and active Agenda views.
- An already unlocked editor should tolerate a temporary disconnect; full
  offline-first operation and durable offline key caching are not required.
- Existing development data may be reset rather than migrated.

Key wrapping, password derivation, recovery, and Organization-key rotation are
the subject of the separate key-management research. Secsync deliberately
leaves key exchange and rotation outside its protocol
([Secsync README](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/README.md#encryption)).

## Current ElderFlow fit

ElderFlow currently wraps PrimeVue's Quill-based Editor in
`RichTextEditor`. Ticket "Add collaborative editing to HTML fields on agenda
view" proposes Tiptap, Yjs, and Hocuspocus and requires an open-source-only
solution. Moving only the collaborative Agenda editors to Tiptap is a contained
editor migration; encrypted scalar fields outside those views do not need to
become CRDT documents.

Tiptap's repository is MIT-licensed, and its
`@tiptap/extension-collaboration` and
`@tiptap/extension-collaboration-caret` packages explicitly declare MIT
licenses
([Collaboration package](https://github.com/ueberdosis/tiptap/blob/1afef870da6f562c25a5d1b8fde2b83cd6b80844/packages/extension-collaboration/package.json),
[caret package](https://github.com/ueberdosis/tiptap/blob/1afef870da6f562c25a5d1b8fde2b83cd6b80844/packages/extension-collaboration-caret/package.json),
[repository license](https://github.com/ueberdosis/tiptap/blob/1afef870da6f562c25a5d1b8fde2b83cd6b80844/LICENSE.md)).
The open-source Collaboration extension accepts either a Yjs document or a
specific Yjs fragment
([Tiptap Collaboration documentation](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)).
The paid `@tiptap-pro/provider`, hosted Collaboration service, Snapshot,
Comments, and other plan-bound features are not needed and should not enter the
dependency graph.

Yjs is network-agnostic and MIT-licensed. Its updates are binary,
commutative, associative, and idempotent, so authorized clients may decrypt and
apply them in any order and still converge
([Yjs update documentation](https://docs.yjs.dev/api/document-updates),
[Yjs license](https://github.com/yjs/yjs/blob/9c1994547d7bc86245a21e1a4c8319f056d05ecf/LICENSE)).
Yjs also has the mature ProseMirror binding used by Tiptap and supports offline
editing and shared cursors
([Yjs README](https://github.com/yjs/yjs/blob/9c1994547d7bc86245a21e1a4c8319f056d05ecf/README.md)).

## Why standard Hocuspocus is not server-blind

Hocuspocus itself is a healthy, self-hostable MIT project. It provides
authentication hooks, read-only connections, persistence extensions, Redis
fan-out, and reconnecting providers
([authentication](https://tiptap.dev/docs/hocuspocus/guides/authentication),
[database extension](https://tiptap.dev/docs/hocuspocus/server/extensions/database),
[Redis extension](https://tiptap.dev/docs/hocuspocus/server/extensions/redis)).
Those are good capabilities for ordinary collaboration.

They do not produce E2EE. The server's message receiver parses Yjs sync
messages and applies updates to a server-side Yjs document, and its database
extension loads updates into a `Y.Doc` and stores
`Y.encodeStateAsUpdate(document)`
([message receiver source](https://github.com/ueberdosis/hocuspocus/blob/6a875b25ee648a98fd16af10e5663116347ced6a/packages/server/src/MessageReceiver.ts),
[database extension source](https://github.com/ueberdosis/hocuspocus/blob/6a875b25ee648a98fd16af10e5663116347ced6a/packages/extension-database/src/Database.ts)).
The same design lets Hocuspocus transform a document to JSON, run webhooks, and
inspect awareness, but it also means the server sees the collaborative content.

Encrypting the Yjs update bytes before handing them to Hocuspocus is not a
drop-in fix: the server could no longer parse the sync message, derive a state
vector, merge updates, enforce Yjs-level read-only behavior, or produce a
snapshot. Replacing those parts turns Hocuspocus into a custom opaque relay and
removes most of the value of selecting it.

There is also a near-term runtime mismatch: Hocuspocus v4 currently requires
Node 22, while ElderFlow targets Node 20 or later
([Hocuspocus package metadata](https://github.com/ueberdosis/hocuspocus/blob/6a875b25ee648a98fd16af10e5663116347ced6a/package.json)).
This is not the decisive rejection—the plaintext server model is—but it is
another integration cost.

## Secsync findings

### Protocol shape

Secsync was designed specifically to relay E2EE CRDTs through a central
service. It supports multiple clients per user, asynchronous synchronization,
real-time encrypted awareness, rebuilding a document without local state, and
both Yjs and Automerge
([architecture requirements](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/architecture-design.mdx)).

Its persisted model contains:

- a document identifier and active snapshot;
- encrypted full-state snapshots;
- encrypted incremental CRDT updates tied to a snapshot;
- encrypted ephemeral messages for awareness;
- public authenticated routing and ordering metadata.

The server assigns an integer version to persisted updates. Updates also carry
a per-client monotonic clock. This lets clients fetch a complete snapshot plus
updates, or a delta from a known snapshot, without asking the server to inspect
the CRDT
([Secsync README](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/README.md#concept),
[client API](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/api/client.mdx)).

Every snapshot, update, and ephemeral message uses
XChaCha20-Poly1305-IETF AEAD and is signed with Ed25519. Document ID, snapshot
ID, author public key, and update clock remain public but are bound as
authenticated data
([Secsync specification](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/specification.mdx)).
The implementation generates a fresh random nonce for each message
([encryption source](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/packages/secsync/src/crypto/encryptAead.ts)).
Libsodium documents that XChaCha20-Poly1305's 192-bit nonce makes random nonces
safe, while still requiring that a nonce never be reused with the same key
([libsodium XChaCha20-Poly1305 documentation](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction)).

Secsync's extra HMAC commitment tag follows libsodium's documented robustness
construction for applications where an attacker may cause a ciphertext to be
tried under a different key
([libsodium AEAD robustness guidance](https://doc.libsodium.org/secret-key_cryptography/aead#robustness)).

### Authorization integration

Secsync does not replace application authorization. Its server API requires
callbacks for read access, snapshot/update/ephemeral write access, and
broadcast access. They receive a document ID, session credential, and—for
writes—the signing public key
([Secsync server API](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/api/server.mdx)).

ElderFlow can map a non-secret collaboration document ID to a Meeting and call
the same authorization policy used by REST. The relay can reject writes when
the Meeting is completed without reading ciphertext. This preserves the
existing role model and completed-Meeting immutability.

The example Secsync server accepts a session key in a query parameter. ElderFlow
should not copy that detail: URL query values are prone to infrastructure
logging. The prototype should authenticate a same-origin secure WebSocket using
the existing session cookie or a short-lived, single-purpose WebSocket token.
That is an integration requirement, not a change to the authorization model.

### Snapshots, compaction, and state vectors

A blind server cannot use `Y.mergeUpdates`, derive Yjs state vectors, garbage
collect Yjs tombstones, or decide whether a full state is semantically complete.
Yjs itself documents that its binary-only merge API does not garbage-collect
deleted content; loading a `Y.Doc` is required to reduce the document size
([Yjs alternative update API](https://docs.yjs.dev/api/document-updates#alternative-update-api)).

Secsync moves compaction to a client. A client periodically serializes
`Y.encodeStateAsUpdateV2(ydoc)`, encrypts it as a new snapshot, and declares the
latest known per-author clocks. Other clients verify the snapshot chain and
merge the decrypted snapshot. The upstream Tiptap example snapshots after 100
updates
([Secsync Tiptap example](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/components/YjsTiptapExample.tsx)).
The server may force a snapshot when an update chain grows too long, but an
authorized client must produce it.

For ElderFlow this implies:

- retain at least one encrypted snapshot and all subsequent encrypted updates;
- trigger snapshot creation by update count and optionally ciphertext size;
- accept that compaction waits until an authorized, unlocked client connects;
- authenticate the snapshot author and verify that its declared update clocks
  cover the previous active snapshot;
- never use snapshots as plaintext application projections;
- retain a recovery window before deleting superseded ciphertext until the
  security design specifies rollback and key-rotation behavior.

### Awareness and metadata

The normal Yjs awareness CRDT carries schemaless JSON such as a user's name,
cursor, and selection. It is intentionally not persisted
([Yjs awareness documentation](https://docs.yjs.dev/getting-started/adding-awareness)).
Ordinary Hocuspocus and `y-websocket` servers decode and relay it.

Secsync instead encrypts awareness as ephemeral messages tied to the document
and snapshot. The relay still learns the document identifier, signing public
key, traffic timing, message sizes, and which sessions may receive messages.
Secsync explicitly provides no metadata-hiding guarantee
([security and privacy considerations](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/security_and_privacy/considerations.mdx)).
That matches ElderFlow's accepted metadata leakage. Awareness payloads must
nevertheless remain minimal: display name, color, cursor/selection, and editing
field ID only—never document text.

### Disconnect and reconnect

Secsync's client accepts pending changes and reports pending-change updates,
allowing unsent Yjs updates to survive reconnects if the application chooses to
persist them
([client API](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/api/client.mdx#onpendingchangesupdated)).
For the first ElderFlow release, an unlocked open page can keep pending
ciphertext or plaintext Yjs state in memory and reconnect automatically.
Reloading the page while disconnected may lose unsent changes; durable browser
storage should wait for the key-storage/offline decision.

### Security and maturity limitations

Secsync has unusually useful public security material for a small project:

- an explicit Internet attacker model and metadata limitations;
- a threat library;
- Verifpal models for confidentiality and freshness;
- hash/signature chains and per-author clocks intended to detect message
  tampering, omission, and replay.

However, its own security document states that document integrity has not been
proven, clients must trust one another unless author keys are verified, the
server can cut off a user undetectably, ephemeral replay protection is
session-limited, and there is no forward or post-compromise security in the
protocol itself
([security considerations](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/security_and_privacy/considerations.mdx),
[threat library](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/documentation/pages/docs/security_and_privacy/threat_library.mdx)).

The operational maturity is also limited:

- the README labels the software beta;
- the published package metadata is version `0.5.0`
  ([package metadata](https://github.com/nikgraf/secsync/blob/03202ba91b847a19a5d94f09a1d5cc12207a5c42/packages/secsync/package.json));
- the inspected default branch's latest commit is
  [`03202ba` from 2024-09-21](https://github.com/nikgraf/secsync/commit/03202ba91b847a19a5d94f09a1d5cc12207a5c42);
- [an open 2025 issue reports broken examples](https://github.com/nikgraf/secsync/issues/119);
- no independent audit report or stable protocol version was identified in the
  repository documentation, releases, or security material.

These facts make Secsync a strong design reference and prototype dependency,
not yet a production-security conclusion.

## Alternatives

| Architecture | Server blind? | Async persistence | Tiptap/Yjs fit | Open-source fit | Assessment |
| --- | --- | --- | --- | --- | --- |
| Standard Tiptap + Hocuspocus + Yjs | No | Yes | Excellent | MIT components available | Reject for Protected text because the server applies Yjs updates. |
| Yjs + `y-websocket` | No by default | Yes with persistence | Excellent | MIT | Same plaintext server problem; hardening it becomes a custom opaque relay. |
| Yjs + `y-webrtc` shared secret | Peer transport may be encrypted | No durable central source by itself | Good | MIT | Reject: participants must overlap online for exchange, peer networking adds operational/privacy complexity, and it does not solve server-blind asynchronous persistence. |
| Tiptap + Yjs + Secsync-style relay | Yes | Yes | Demonstrated upstream | Apache-2.0 Secsync; MIT editor/CRDT | Best fit, subject to prototype and security gates. |
| Automerge + Automerge Repo | No E2EE layer in documented default architecture | Yes | Weaker for ElderFlow's existing Vue/Tiptap direction | MIT | Credible CRDT alternative, but encryption still needs an opaque relay and its rich-text bindings are newer; no compensating ElderFlow benefit found. |
| Automerge + Secsync-style relay | Yes | Yes | Requires changing CRDT/editor integration | MIT + Apache-2.0 | Technically viable and demonstrated by Secsync, but adds migration and bundle/runtime complexity without solving a problem Yjs leaves open. |

### Automerge detail

Automerge is actively maintained, has a stable JavaScript core, a compact CRDT
format, and a sync protocol
([Automerge repository](https://github.com/automerge/automerge)).
Automerge Repo supplies pluggable WebSocket networking, IndexedDB/browser
storage, and server storage adapters
([Automerge Repo README](https://github.com/automerge/automerge-repo/blob/281ebc0ef7a6a6c8e984da3831ddc1dba1fd401c/README.md)).
Its ProseMirror rich-text binding exists, but the schema documentation calls
the current schema a work in progress
([Automerge rich-text schema](https://automerge.org/docs/reference/under-the-hood/rich-text-schema/)).

Automerge Repo's normal sync server is a CRDT peer and storage node, not a
server-blind ciphertext relay. Wrapping its protocol messages in encryption
would prevent the server from maintaining the peer-specific sync state that
makes the protocol efficient. A Secsync-style snapshot/update relay can carry
Automerge changes, but at that point ElderFlow would incur an editor/CRDT
replacement while retaining the same experimental encrypted relay. It should
remain a fallback only if a prototype reveals a Yjs-specific blocker.

## Recommended ElderFlow architecture

### Document granularity

Use **one Yjs document per Meeting**, not one document per field and not one
organization-wide document.

The document should contain a map keyed by stable domain identifiers and field
names for only the long-form fields that are collaborative in preparation and
the active Agenda. This choice:

- maps cleanly to existing Meeting-level authorization and completion status;
- needs one socket and one snapshot chain for the screen users collaborate in;
- allows awareness to identify the active field without opening many rooms;
- freezes the entire collaboration boundary when the Meeting completes;
- prevents unrelated Meetings from sharing one compromise or corruption
  boundary;
- avoids per-field connection and snapshot overhead.

Short Protected fields remain separately encrypted scalar envelopes through
the ordinary API. Topic history outside the active Meeting consumes finalized
encrypted values or a client-readable historical representation decided by the
data-inventory and paired-text work; it should not require the backend to open
the Yjs document.

### Client flow

1. Authenticate normally.
2. Unlock the Organization key through the separately designed key hierarchy.
3. Load the Meeting's encrypted snapshot and subsequent encrypted updates.
4. Verify message signatures, chain/clock metadata, and AEAD before applying
   any Yjs update.
5. Bind the relevant Yjs fragments to open-source Tiptap collaboration
   extensions.
6. Encrypt/sign each local incremental update before sending it.
7. Encrypt awareness through the ephemeral channel.
8. Keep unsent changes in memory across transient reconnects.
9. Create a complete encrypted snapshot after the configured update/size
   threshold.
10. On Meeting completion, flush acknowledged changes, make editors read-only,
    disconnect the room, and reject any subsequent write at the backend.

### Relay and persistence flow

The NestJS collaboration endpoint should:

- authenticate the current ElderFlow session without putting a reusable secret
  in a URL;
- map an opaque collaboration document ID to a Meeting;
- call existing authorization for read/write/broadcast decisions;
- persist only ciphertext, nonce, signature, public ordering/routing metadata,
  and structural timestamps;
- enforce per-author monotonic clocks, snapshot ancestry, message-size limits,
  rate limits, and completed-Meeting immutability;
- broadcast only to currently authorized sessions;
- never instantiate a `Y.Doc`, call Tiptap transformers, log message bodies, or
  emit content-bearing webhooks.

Use PostgreSQL as the authoritative ciphertext store. A single process and
in-memory room registry is sufficient initially; horizontal fan-out can later
carry the same opaque messages through Redis without altering the encryption
boundary.

### Cryptographic envelope requirements

The production protocol must be versioned and must bind at least the protocol
version, organization, collaboration document, snapshot, message kind, author
key, and monotonic clock as AEAD additional data. Use a well-reviewed library
and protocol construction rather than new application cryptography. The
Secsync choice of XChaCha20-Poly1305 with random nonces and Ed25519 signatures
is credible, but the final construction belongs in the E2EE security review
dossier and needs stable cross-client test vectors.

Signing keys must support multiple devices. Whether keys identify a device or
a user, and how clients learn the authorized signing-key set, is deliberately
left to the key-management research. The relay can enforce that a write's
public key belongs to the authenticated user without learning plaintext.

## Prototype gates and explicit unknowns

The following questions must be answered by a throwaway integration prototype
before production tickets are written:

1. **Library strategy:** Can the framework-agnostic `secsync` state machine and
   `secsync-server` callbacks be cleanly integrated with Vue, NestJS, current
   TypeScript, and current Yjs, or must ElderFlow maintain a fork?
2. **Broken/upstream-stale behavior:** Reproduce reconnect, snapshot, and
   example behavior rather than relying on the currently broken hosted/example
   path.
3. **Completion race:** Define and test the acknowledgment boundary when one
   client completes a Meeting while another has an in-flight or temporarily
   disconnected update. The server must not silently accept post-completion
   content, and the UI must not report an unacknowledged update as saved.
4. **Snapshot integrity:** Test omission, reordering, replay, corrupt
   ciphertext, concurrent snapshot proposals, and a malicious/buggy authorized
   client. Decide which clients may create snapshots and how a client detects
   an incomplete chain.
5. **Compaction policy:** Measure update count, snapshot size, load time, and
   mobile memory for representative Meeting documents. The upstream example's
   threshold of 100 is illustrative, not a justified ElderFlow default.
6. **Document schema:** Prove that one Meeting document can safely bind several
   independently mounted Tiptap editors, survives conditional Agenda
   rendering, and does not duplicate content on reconnect.
7. **Awareness:** Verify encrypted cursor/presence behavior, reconnection, stale
   presence expiry, and that no Protected text enters awareness or logs.
8. **WebSocket authentication:** Verify same-origin session or short-lived
   token authentication, revocation during an open socket, role checks, and
   `it-admin` exclusion without URL credential leakage.
9. **Transient disconnect:** Test concurrent edits during a network outage,
   merge after reconnect, browser backgrounding, and explicit warning before a
   page with unacknowledged changes closes.
10. **Cross-device compatibility:** Run deterministic protocol vectors and
    collaboration scenarios in two desktop browsers and a mobile browser.
11. **Dependency boundary:** Produce a lockfile/license inventory proving that
    no `@tiptap-pro/*`, hosted Tiptap service, or paid-only collaboration
    package is required.
12. **Security review:** Reconcile the prototype protocol with Secsync's known
    limitations, document every metadata leak and unproven guarantee, and
    obtain independent review before calling the result E2EE-ready.

## Decision recommendation

Proceed to the next Wayfinder decisions with this working architecture:

> ElderFlow uses Tiptap + Yjs in the client and a Secsync-style
> snapshot/update/ephemeral-message protocol over a central opaque
> NestJS/PostgreSQL relay. It does not use Hocuspocus as the collaboration
> server for Protected text. One collaboration document represents one
> Meeting. Secsync is a prototype input and possible pinned/forked dependency,
> not yet an approved production dependency.

The research does **not** establish that Secsync is secure enough for
production. It establishes that its separation of client-side CRDT processing
from server-side ciphertext relay is the appropriate architecture to validate,
and that neither standard Hocuspocus nor Automerge Repo removes the need for
that encrypted relay.
