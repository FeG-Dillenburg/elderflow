# E2EE key-slice dependency review

Issue #48 introduces two pinned runtime dependencies in both the browser and Node reference harness.

| Dependency | License and provenance | Purpose and rationale | Compatibility and maintenance | Runtime impact |
| --- | --- | --- | --- | --- |
| `libsodium-wrappers-sumo@0.7.15` | ISC; official `jedisct1/libsodium.js` package | Supplies the WebAssembly-capable libsodium API required for XChaCha20-Poly1305, Argon2id v1.3, Ed25519, secure randomness, and memory clearing. The sumo build is required because the ordinary wrapper omits `crypto_pwhash`. | Runs in supported modern browsers, Web Workers, and Node. Version 0.7.15 is pinned because 0.7.16's published ESM wrapper references a missing adjacent `libsodium-sumo.mjs`; upgrades require rerunning every byte vector and browser build. | About 1.05 MB minified for the short-lived KDF Worker. The main bundle currently shares the wrapper for AEAD/signing and grows by about 1.6 MB before gzip; later encrypted-content slices can split this behind the unlock boundary. |
| `cbor-x@1.6.0` | MIT; `kriszyp/cbor-x` | Encodes deterministic array-only authenticated structures and rejects accepted input whose exact bytes differ on canonical re-encoding. It avoids a custom security-sensitive CBOR parser. | Browser and Node compatible. Native extraction is optional and not approved or required; the JavaScript path is used. Version changes require complete vector and negative-vector reruns. | Small relative to libsodium. No native build is needed in deployment. |

`@types/libsodium-wrappers-sumo@0.7.8` is a development-only declaration package. No hosted service, paid feature, Secsync runtime, or proprietary cryptographic implementation was introduced.

The lockfile is authoritative for transitive versions and integrity hashes. The project intentionally refused package build scripts during installation; the selected paths do not depend on them.
