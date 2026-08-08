# Web Crypto and the Argon2id unlock profile

## Conclusion

The standardized, cross-browser Web Crypto API cannot derive ElderFlow's committed Argon2id v1.3 key. Its current algorithm overview contains HKDF and PBKDF2 as the only password/key-derivation algorithms; Argon2 is absent. PBKDF2 is a different algorithm and therefore cannot reproduce an Argon2id reference vector or preserve the profile's memory-hard cost. [Web Cryptography API Level 2, algorithm overview](https://www.w3.org/TR/webcrypto/#algorithm-overview), [PBKDF2 definition](https://www.w3.org/TR/webcrypto/#pbkdf2), [RFC 9106, Argon2 introduction and v1.3](https://www.rfc-editor.org/rfc/rfc9106.html#section-1)

There is a newer Web Incubator Community Group proposal for Argon2id, but it explicitly identifies itself as an unofficial proposal rather than a W3C Standard or Standards Track document. It therefore cannot be treated as an available cross-browser API for the current ElderFlow support matrix. [Modern Algorithms in the Web Cryptography API, status](https://wicg.github.io/webcrypto-modern-algos/#sotd), [proposed Argon2 API](https://wicg.github.io/webcrypto-modern-algos/#argon2)

Consequently, an exact implementation needs an Argon2id implementation outside Web Crypto. WebAssembly is not a cryptographic requirement—correct pure JavaScript could implement the same algorithm—but it is the practical implementation route being benchmarked. Replacing Argon2id with `crypto.subtle` PBKDF2 would be a protocol change, not an implementation optimization.

Web Crypto can still provide primitives that are actually in its registry, and `crypto.getRandomValues()` can supply randomness. That does not remove the need for user-space code for Argon2id.

## Why `libsodium-wrappers-sumo`

libsodium.js describes itself as libsodium compiled to both WebAssembly and pure JavaScript. It requires callers to await its `ready` promise. It also documents that `crypto_pwhash_*`, which exposes Argon2id, is present only in the larger **sumo** build. [Official libsodium.js README](https://github.com/jedisct1/libsodium.js#overview), [module initialization](https://github.com/jedisct1/libsodium.js#usage-as-a-module), [standard versus sumo](https://github.com/jedisct1/libsodium.js#standard-vs-sumo-version)

The pure-JavaScript copy is a compatibility fallback, not Web Crypto. It still runs libsodium's algorithm in JavaScript and is expected to be much less attractive for a 64 MiB memory-hard operation; it must produce the same bytes with the same parameters to be acceptable. The prototype should not silently substitute PBKDF2 or lower the Argon2id memory/time limits.

## Interpreting Safari's `new WebAssembly.RuntimeError` error

The probe deliberately replaces `globalThis.WebAssembly` with `undefined` before importing the pinned `libsodium-sumo@0.7.16` runtime. In that exact generated artifact, the Emscripten abort path constructs `new WebAssembly.RuntimeError(...)`, while the surrounding loader also contains a `useBackupModule()` pure-JavaScript path. Once the probe has erased `WebAssembly`, the abort path itself dereferences `undefined`, producing Safari's `TypeError` before it can report the original WebAssembly initialization failure cleanly. [Exact `libsodium-sumo@0.7.16` generated source](https://github.com/jedisct1/libsodium.js/blob/0.7.16/dist/modules-sumo/libsodium-sumo.js), [official libsodium.js description of the dual WebAssembly/pure-JavaScript build](https://github.com/jedisct1/libsodium.js#overview)

This is evidence that the harness's forced-no-WebAssembly route is not a reliable way to benchmark the fallback in Safari; it is not evidence that Web Crypto can perform Argon2id. For production there are two coherent choices:

1. Require WebAssembly in the supported-browser contract and fail closed with a localized compatibility message when it is absent. Older hardware can still be supported as long as its browser provides WebAssembly; device age and WebAssembly availability are separate concerns.
2. If no-WebAssembly operation is truly required, test a deliberately selected and directly loadable pure-JavaScript Argon2id artifact against the same reference vector and device thresholds. Do not depend on mutating the global object to force an undocumented internal fallback.

For the current prototype question, option 1 is the simpler production boundary unless product requirements explicitly demand browsers without WebAssembly. Physical older-phone benchmarking remains relevant for latency and memory pressure on the WebAssembly path.
