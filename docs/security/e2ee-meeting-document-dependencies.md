# Encrypted Meeting document dependencies

## Yjs

- Package: `yjs`
- Pinned version: `13.6.32`
- Upstream: <https://github.com/yjs/yjs>
- Documentation: <https://docs.yjs.dev>
- License: MIT
- Runtime location: frontend only

Yjs provides the versioned Meeting document, stable named `Y.Text` fragments, Update V2 generation/application, and full-state snapshot encoding. The backend intentionally does not import Yjs: it validates canonical CBOR envelope metadata, signatures, contexts, counters, and size limits while persisting only opaque bytes.

The pinned version is the protocol compatibility boundary for Meeting codec version 2. Upgrades require replaying the shared browser/Node fixture in `docs/security/fixtures/meeting-document-vectors.json`, the Meeting document codec tests, production builds, and the PostgreSQL integration suite before changing this pin.

Yjs was selected because it provides open-source, deterministic state/update primitives with named shared types and an established Update V2 wire representation without requiring its server components. A bespoke text CRDT would substantially enlarge the cryptographic and convergence review surface; ordinary Hocuspocus and `y-websocket` are unsuitable because the ElderFlow backend must remain document-blind.

Maintenance is controlled through the exact lockfile pin and the compatibility gate above. The package adds browser-only CRDT code and one volatile `Y.Doc` per loaded Meeting; it adds no backend runtime or database process. The production build reports its effect as part of the existing application chunks, and the document session destroys every loaded document on relock to bound retained plaintext and CRDT state.

## Existing cryptographic dependencies

Meeting documents reuse the repository's reviewed browser cryptography stack: `libsodium-wrappers-sumo` for XChaCha20-Poly1305 and Ed25519, `cbor-x` for deterministic canonical CBOR, and the Web Crypto API for HKDF-SHA-256. No new server-side decryption dependency is introduced.
