# Argon2id unlock benchmark prototype

> PROTOTYPE — disposable evidence, not production unlock code.

## Question

Can ElderFlow's committed shared-passphrase profile use `libsodium-wrappers-sumo@0.7.16` to derive a 32-byte Argon2id v1.3 key with `opslimit=3` and `memlimit=67_108_864` on the lowest supported desktop and smartphone browsers, within human-acceptable thresholds and without silently lowering those parameters?

Run from the repository root:

```sh
pnpm prototype:argon2id-unlock
```

This command intentionally exists only on the throwaway `prototype/benchmark-fixed-argon2id-unlock-profile` branch. A “command not found” error means the current checkout is on another branch; switch to the prototype branch or run it from a separate worktree for that branch rather than copying the prototype into production work.

The browser page runs one cold and three warm derivations in a dedicated Worker, checks every result against a native-libsodium reference vector, measures main-thread responsiveness and available browser memory telemetry, probes hard cancellation by terminating the Worker, and probes the pinned runtime with WebAssembly deliberately unavailable. Export one JSON file for every matrix entry.

The Vite server listens on the local network. A phone on the same trusted Wi-Fi can open the `Network` URL printed by Vite, followed by `/prototypes/argon2id-unlock/`. The harness uses `crypto.getRandomValues()` for internal request IDs because LAN HTTP is not a secure context and older browsers may not expose `crypto.randomUUID()` there. Treat desktop CPU-throttled or emulated runs as supplementary diagnostics only; they cannot replace physical-phone evidence.

## Fixed cross-runtime vector

- Runtime under test: `libsodium-wrappers-sumo@0.7.16`
- Reference runtime: PyNaCl 1.6.2 backed by native libsodium
- Passphrase after NFC normalization: `ElderFlow benchmark v1 — Grüße`
- UTF-8 password: `456c646572466c6f772062656e63686d61726b20763120e28094204772c3bcc39f65`
- Salt: `000102030405060708090a0b0c0d0e0f`
- Expected 32-byte result: `95045343ed5c18bc0ec4512e50155ec50df15be6eaa4ee04255b8c8550915700`

The prototype passes the stored-parameter check only when output length, algorithm, `opslimit`, `memlimit`, salt, and result bytes remain exact. It contains no adaptive cost path.

### Pinned package entry

The published `libsodium-wrappers-sumo@0.7.16` ESM entry imports `./libsodium-sumo.mjs`, but that file is shipped in its `libsodium-sumo@0.7.16` dependency rather than beside the wrapper. The prototype Vite configuration therefore aliases the package to its CommonJS entry, whose dependency resolution works, while retaining the exact same pinned wrapper and native runtime versions. This workaround is prototype evidence, not a recommendation to copy an undocumented package-layout assumption into production; the implementation specification must either validate a reviewed package release or own an explicit, integrity-checked bundling step.

## Proposed support matrix

| Tier | Browser policy | Representative hardware | Evidence |
| --- | --- | --- | --- |
| Lowest desktop | Chromium current−1, Firefox ESR, Safari current−1 | 2 logical cores, 4 GiB RAM | One physical run per engine |
| Current desktop | Current Chromium, Firefox, Safari | Maintained x86-64 or ARM64 laptop | One physical run per engine |
| Lowest Android | Chrome Android current−1 | Supported 4 GiB low-end phone | Physical device, not emulation |
| Lowest iPhone | Safari on oldest iPhone receiving current iOS | That physical iPhone | Physical device, not simulator |
| Current phones | Current Chrome Android and Mobile Safari | Current mid-range Android and iPhone | One physical run per platform |

The relative browser policy avoids freezing version numbers in a long-lived specification. Record exact browser, OS, and hardware versions in the exported evidence and refresh the baseline when the supported platform policy changes.

## Proposed thresholds

- Cold end-to-end unlock: at most 4 seconds on desktop, 6 seconds on phone.
- Warm median: at most 3 seconds on desktop, 5 seconds on phone; no derivation over 8 seconds.
- Main-thread interval gap and Worker termination: at most 250 ms.
- Exact native-reference result and exact fixed parameters on every derivation.
- No crash, out-of-memory event, or allocation failure. Measured growth while the Worker is alive should not exceed 192 MiB, and retained growth after Worker termination should not exceed 32 MiB. Where browser memory APIs are unavailable, capture the peak and post-run state in the browser profiler manually.
- Without WebAssembly, the pinned runtime may produce the same reference bytes with the exact profile or refuse to initialize/derive. A parameter downgrade is always a failure.

These thresholds are the concrete proposal this HITL prototype exists to test. Acceptance of the profile requires evidence for the whole matrix, not a passing development-machine run.

## Cancellation semantics

`crypto_pwhash` is synchronous inside its Worker. A message sent to that busy Worker cannot interrupt the active call. The prototype therefore tests the production-viable cancellation boundary: terminate the entire short-lived unlock Worker, discard its in-memory result, and create a new Worker for a later attempt. This keeps the UI responsive and avoids pretending libsodium offers cooperative cancellation.

## Known measurement limits

Browser JavaScript cannot portably observe the peak native/Wasm allocation. The page uses `performance.measureUserAgentSpecificMemory()` when available, then Chromium's non-standard `performance.memory`, and otherwise marks memory as requiring manual evidence. The isolated prototype Vite configuration supplies COOP/COEP headers for the first API. Device-memory values and user-agent strings are evidence metadata, not trusted capability detection.
