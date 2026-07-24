# Browser key management for shared unlock and recovery

## Research question

Which browser-compatible key hierarchy and unlock design best satisfies
ElderFlow's Protected-text threat model without depending on local login
passwords or one device?

This report covers key management only. It does not choose the encrypted CRDT
or collaboration protocol. That decision must use the same key-envelope
boundary, but it is the subject of the parallel collaboration research.

## Constraints

The Wayfinder discussion established these constraints:

- The database, backups, backend, and an honest-but-curious infrastructure
  administrator must not learn Protected text.
- A malicious administrator who changes the JavaScript served to users, a
  compromised browser, and a compromised user device are outside the threat
  model. This limitation must remain visible in the eventual security claims.
- Authentication and authorization remain separate from content unlock.
  ElderFlow may later use OAuth2 or OpenID Connect and may have no local login
  passwords.
- Content-authorized users need an explicit second unlock step. An `it-admin`
  must never receive an unlock envelope or unlock prompt.
- A user must be able to unlock from multiple browsers, computers, and
  smartphones. A device-specific key may be an optional enhancement, not the
  only recovery path.
- The first release needs temporary-disconnection tolerance, not durable
  offline login.
- Leadership-controlled loss recovery is required. User-facing offboarding is
  outside this Wayfinder effort, but the format must permit later rotation.

## Executive recommendation

Use a **versioned key-envelope hierarchy with pluggable unlock slots**:

1. Generate a random 256-bit **Organization Root Key** (ORK) in an authorized
   browser. Never derive this key from a password.
2. Derive a **Password Key-Encryption Key** (password KEK) from the shared
   unlock passphrase using Argon2id with a random salt and parameters stored in
   the unlock slot. Use that KEK only to authenticated-encrypt or wrap the ORK.
3. Generate a separate, high-entropy **Recovery KEK** and use it to create a
   second authenticated ORK envelope. Deliver the recovery secret to designated
   leadership outside ElderFlow and store only its envelope on the server.
4. Have the ORK protect one or more random, versioned **Content Keys**. Content
   encryption and collaborative-document keys are below this boundary. Do not
   use the password KEK or the ORK directly as a general-purpose field
   encryption key.
5. Model shared-password, recovery, and future per-user or device mechanisms as
   typed unlock slots around the same ORK. This keeps the initial UX simple
   without making a shared password an irreversible protocol decision.

Changing the shared passphrase then derives a new password KEK and replaces
only the password unlock slot. Changing recovery material replaces only the
recovery slot. Rotating the ORK rewraps the much smaller set of Content Keys.
None of those operations requires decrypting and re-encrypting all Protected
text.

This is the best initial fit for ElderFlow's small, trusted leadership team and
explicit second-password UX. It is also independent of login credentials and
works on a new device without transferring a device key.

The recommendation is conditional on two later validations:

- benchmark Argon2id on the oldest supported smartphones and browsers; and
- select the content/document AEAD and nonce strategy jointly with the
  encrypted-collaboration architecture.

## Why an envelope hierarchy is necessary

A password is not suitable as a direct encryption key. NIST SP 800-132
describes password-based derivation specifically for protecting stored data or
data-protection keys, and RFC 9106 specifies the memory-hard Argon2 function
and recommends Argon2id when side-channel risk is uncertain
([NIST SP 800-132](https://csrc.nist.gov/pubs/sp/800/132/final),
[RFC 9106, section 4](https://www.rfc-editor.org/rfc/rfc9106.html#section-4)).

Separating the password-derived KEK from the random ORK produces two important
properties:

- a passphrase can change without touching content ciphertext; and
- the same ORK can be recovered through a separately controlled envelope.

NIST defines a key-encryption key as a key used to protect other keys, and its
key-wrapping recommendation requires confidentiality and integrity for wrapped
key material
([NIST key-encryption-key definition](https://csrc.nist.gov/glossary/term/key_encryption_key),
[NIST SP 800-38F](https://csrc.nist.gov/pubs/sp/800/38/f/final)).

The extra Content Key layer makes ORK rotation another rewrapping operation.
Content Keys should be versioned so a new key can protect future writes while
old keys remain available for historical ciphertext. If a Content Key itself
is compromised, however, rewrapping cannot restore confidentiality for data
already encrypted with it. Protecting unchanged historical ciphertext after
such a compromise requires content re-encryption.

## Password KDF

### Preferred KDF: Argon2id

Use Argon2id, not a fast hash and not HKDF, for the human-entered shared
passphrase. RFC 9180 explicitly warns that HKDF does not slow dictionary
attacks and is unsuitable for turning a low-entropy password into a PSK
([RFC 9180, section 9.5](https://www.rfc-editor.org/rfc/rfc9180.html#section-9.5)).

RFC 9106's second recommended Argon2id profile for memory-constrained
environments is:

- 64 MiB memory;
- three passes;
- four lanes;
- a 128-bit salt; and
- a 256-bit output.

That profile is a starting point, not a value to copy without measurement.
ElderFlow must benchmark unlock time and memory behavior on representative
low-end smartphones, Mobile Safari, Chrome, and Firefox. Establish one
organization-wide parameter set that all supported clients can execute; store
the complete algorithm identifier, Argon2 version, salt, and work parameters
with the envelope. Do not silently reduce work factors on a slow device.

The official `libsodium.js` project provides maintained WebAssembly and
pure-JavaScript browser builds of libsodium. Its password-hashing functions are
available in the larger "sumo" build, and its wrapper exposes a best-effort
`memzero()` helper
([libsodium.js README](https://github.com/jedisct1/libsodium.js#readme)).
This is a credible implementation candidate, but its bundle size and actual
mobile performance must be measured.

### Native PBKDF2 alternative

Web Crypto provides native PBKDF2, HKDF, AES-GCM, and AES-KW. Its `CryptoKey`
objects can be non-extractable and serializable
([Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/)).
PBKDF2 therefore has a browser-compatibility and opaque-key advantage.
However, it is not memory-hard and offers less resistance to parallel offline
guessing than Argon2id. It should be considered a separately versioned
compatibility profile only if the supported-device study shows that the
maintained Argon2id/Wasm implementation is not viable. A client must never
quietly downgrade an Argon2id envelope to PBKDF2.

### Passphrase input rules

The stored ORK envelope is an offline passphrase verifier: a database thief can
try a guess, derive a KEK, and test whether authenticated unwrap succeeds.
Server-side rate limiting cannot prevent this attack. The UX must therefore
encourage a long, unique passphrase, allow password-manager paste/autofill, and
reject commonly compromised choices at setup. NIST recommends accepting long
passwords, permitting password managers and paste, avoiding composition rules,
and storing algorithm and cost parameters for future migration
([NIST SP 800-63B, section 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html#passwords)).

Define the byte conversion exactly and test it across clients. A reasonable
profile is UTF-8 after Unicode NFC normalization, without case folding or
locale-sensitive transformations. Whitespace handling must be explicit; silent
trimming makes valid passphrases ambiguous. The password itself is never sent
to the backend.

## Authenticated encryption and key separation

Every key envelope and Protected-text ciphertext needs authenticated
encryption. Encryption without integrity would let a database editor alter
plaintext indirectly. AES-GCM is available through Web Crypto; NIST specifies
it as authenticated encryption with associated data and requires IV uniqueness
for every message under a key
([NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final)).
Web Crypto also implements AES-KW as specified by RFC 3394, specifically for
wrapping key material
([Web Cryptography Level 2, AES-KW](https://www.w3.org/TR/webcrypto-2/#aes-kw),
[RFC 3394](https://www.rfc-editor.org/rfc/rfc3394.html)).

The final suite should use a maintained high-level construction, not a new
composition. AES-GCM/AES-KW through Web Crypto minimizes dependency and can
keep imported keys non-extractable. XChaCha20-Poly1305 through libsodium has a
larger nonce that is operationally attractive for many independent clients,
but keeps key bytes in the Wasm/JavaScript boundary and adds a dependency.
The encrypted-collaboration research must determine whether one suite can be
used consistently for snapshots, short fields, and CRDT updates.

Use HKDF with explicit, versioned `info` labels to derive purpose-specific keys
where derivation is required. RFC 5869 defines `info` for binding derived keys
to application and context and discusses the need for independence
([RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html)).
At minimum, separate:

- password/recovery wrapping;
- Content Key wrapping;
- short-field encryption;
- collaborative-document encryption; and
- any integrity or deterministic identifier operation added later.

Do not reuse an AEAD key across purposes merely because the primitive accepts
it.

Authenticated associated data should bind a ciphertext to its structural
context, such as organization identifier, record identifier, field/document
identifier, key version, and format version. This prevents a server or database
editor from moving a valid ciphertext into a different record or field without
detection. Metadata required to find and authorize the record remains
server-readable.

## Unlock-slot options

### Option A: one shared passphrase slot

All content-authorized users enter the same passphrase. Argon2id derives the
password KEK, which unwraps the ORK locally.

**Benefits**

- Lowest onboarding and support complexity for the intended small team.
- Works after OAuth2/OIDC login without depending on an identity-provider or
  local account password.
- Works immediately on another desktop or smartphone.
- Makes the visible second unlock step straightforward.
- Passphrase rotation rewraps one ORK envelope.

**Costs and limits**

- Every content user knows the same authority-bearing secret.
- There is no cryptographic attribution to an individual.
- Anyone with an old passphrase and an old database copy can keep attempting
  offline decryption.
- Changing the passphrase cannot revoke an ORK or plaintext that a former
  member already copied. Authentication can prevent future server fetches, and
  a new Content Key can protect future content, but cryptography cannot erase
  prior knowledge.
- Coordinating a passphrase change requires one unlocked or recovery-authorized
  client and version/conflict handling for the envelope update.

This option meets the currently agreed threat model, but its limits must be
stated in the E2EE security review dossier.

### Option B: one passphrase envelope per user

Each user has a separate unlock passphrase and a separately wrapped copy of the
same ORK.

**Benefits**

- Individual passphrases and envelopes can be changed or disabled.
- No shared human secret needs to be distributed.
- Still independent of OAuth2/OIDC and usable from multiple devices.

**Costs and limits**

- Adding a user requires an already unlocked authorized client or recovery
  authority to create the new ORK envelope.
- Each user has an independent loss-recovery problem.
- More lifecycle and support UX is required.
- Removing an envelope still cannot revoke key material or plaintext the user
  already copied.

This is a credible future evolution if the shared-secret operational model
becomes unsuitable.

### Option C: device public/private keys

The ORK can be wrapped to a public key for each device, or an authenticated key
agreement/encryption standard such as HPKE can establish a wrapping secret.
HPKE defines recipient-public-key encryption and authenticated variants
([RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)).

This removes repeated passphrase entry on enrolled devices, but secure private
key persistence and device transfer become the hard problem. A non-extractable
`CryptoKey` in IndexedDB is origin-scoped but browser storage may be cleared and
Web Crypto does not guarantee that underlying key material is hardware-backed
or even encrypted at rest. A device-only private key also violates ElderFlow's
multi-device requirement unless paired with onboarding or recovery.

WebAuthn Level 3 defines a PRF extension expressly capable of deriving
client-side encryption keys from a credential. Support is optional, outputs
may be unavailable during credential creation, and the specification is still
a newer capability than baseline Web Crypto
([WebAuthn Level 3, PRF extension](https://www.w3.org/TR/webauthn-3/#prf-extension)).
It is promising as an optional "remember/unlock this device" slot after a
compatibility study, not as the root design.

### Recommended hybrid

Implement a generic unlock-slot envelope model, but ship the shared passphrase
slot plus recovery slot first. Reserve versioned slot types for future
per-user, device-key, or WebAuthn-PRF wrappers. Do not implement those future
types until their lifecycle and compatibility are justified.

## Loss recovery

Generate recovery material from a cryptographically secure random source; do
not ask leadership to invent a second memorable password. The recovery secret
should have at least 256 bits of entropy and be encoded with a version and
checksum/error-detection suitable for printing, file storage, and potentially
a QR code. Exact encoding and custody policy remain decisions for the
security-UX prototype and security dossier.

The recovery secret derives or directly supplies a Recovery KEK that wraps the
same ORK. ElderFlow stores the recovery envelope, never the recovery secret.
Recovery happens in an authorized browser: unwrap the ORK, choose a new shared
passphrase, derive a new password KEK, and publish a replacement password slot.
Protected content is untouched.

The recovery flow must require both normal content authorization and possession
of recovery material. This keeps an `it-admin` from turning a copied recovery
string into a content-access path through an otherwise unauthorized account.

Open policy decisions include:

- whether one recovery secret is held jointly or multiple independent recovery
  slots are issued;
- which leadership role may replace unlock slots;
- how printed/exported recovery material is confirmed and periodically tested;
  and
- whether a later effort needs multi-person approval or threshold recovery.

If all password and recovery material is lost, the server cannot restore
Protected text. That is a required consequence of the threat model, not an
error that IT administrators can repair.

## Rotation semantics

The design must distinguish four operations:

| Operation | Required cryptographic work | What it does not achieve |
| --- | --- | --- |
| Change shared passphrase | Derive a new password KEK and replace its ORK envelope | Does not revoke ORK/plaintext already copied |
| Replace recovery secret | Replace the recovery ORK envelope | Does not change content keys |
| Rotate ORK | Generate a new ORK and rewrap Content Keys plus active unlock slots | Does not repair a compromised Content Key |
| Rotate Content Key | Use a new version for future writes; optionally re-encrypt selected old data later | Does not erase historical ciphertext or plaintext already copied |

Envelope updates need optimistic concurrency or an atomic backend operation on
server-readable versions so two unlocked clients cannot silently overwrite
each other's rotation. Clients must not delete the last working unlock or
recovery slot until the replacement has been locally verified.

Future offboarding can combine normal authorization removal with passphrase and
forward Content Key rotation. It cannot make previously disclosed history
secret again, so promising retroactive revocation would be misleading.

## Browser and multi-device behavior

### Session lifetime

By default, keep the ORK and derived Content Keys only in the active
browser-memory session. Release application references on explicit lock,
logout, identity/role change, and tab termination. An inactivity policy should
be selected in the UX prototype so it does not interrupt a meeting.

Web Crypto explicitly does not require user agents to zeroize a `CryptoKey`
after references disappear, and does not guarantee how keys are stored.
Script injection can exfiltrate keys or plaintext. Therefore "memory only" is
a useful exposure reduction, not a secure-erasure guarantee
([Web Cryptography Level 2, security considerations](https://www.w3.org/TR/webcrypto-2/#security-considerations)).
JavaScript strings are immutable, so the passphrase itself also cannot be
reliably wiped. Run the password KDF in a worker where practical, minimize
copies and lifetime, and wipe mutable byte arrays as a best effort.

Do not persist the unwrapped ORK, Content Keys, or plaintext in `localStorage`,
IndexedDB, service-worker caches, telemetry, or error reports in the first
release. Persisting server-provided wrapped keys and encrypted content is safe
subject to metadata leakage and cache lifecycle.

### Temporary disconnect

An already unlocked tab can continue decrypting cached ciphertext and editing
locally while the network is temporarily unavailable. It retains its in-memory
keys until explicitly locked or the page is destroyed. A page reload or
browser eviction may require another unlock and network access unless a future
offline-first effort deliberately caches the application and wrapped
envelopes. The first release should not promise offline login.

### Multiple devices and tabs

The shared passphrase and server-held envelope let every authorized browser
derive the same ORK independently. There is no device registration requirement,
and OAuth2/OIDC supplies only the authenticated authorization session.

Each tab should unlock independently at first. Sharing a `CryptoKey` via
`postMessage`, IndexedDB, or a shared worker expands the number of execution
contexts able to use it; Web Crypto warns that access cannot later be revoked
from a destination once shared. Cross-tab convenience should therefore be a
separate, explicit security/UX choice.

## Versioned format requirements

All persisted cryptographic objects must be self-describing enough to select a
supported decoder without guessing. At minimum, an unlock slot needs:

- envelope format version and slot type;
- organization and ORK identifiers/versions;
- cryptographic suite identifier;
- KDF algorithm, version, parameters, salt, and text-encoding profile where
  applicable;
- nonce/IV where the suite requires one;
- wrapped key ciphertext and authentication tag; and
- the schema/version of authenticated associated data.

Protected-text and collaborative-document ciphertext also need their Content
Key identifier/version, cipher suite, nonce strategy, and authenticated context.
Unknown versions or algorithms must fail closed, not fall back.

Publish deterministic interoperability vectors for:

- Unicode passphrase normalization and UTF-8 encoding;
- password and recovery ORK wrapping;
- wrong-secret and modified-metadata rejection;
- Content Key wrapping;
- field/document associated-data binding; and
- each supported format migration.

The eventual E2EE security review dossier should include these vectors and
steps for verifying them in a running browser.

## Decision comparison

| Property | Shared passphrase slot | Per-user passphrase slots | Device/public-key slots |
| --- | --- | --- | --- |
| Explicit second unlock | Yes | Yes | Optional biometric/device ceremony |
| Independent of login password/OIDC | Yes | Yes | Yes |
| New browser/smartphone | Enter shared secret | Enter personal secret | Requires synced credential or enrollment |
| Initial operational complexity | Low | Medium | High |
| Individual secret rotation | No | Yes | Yes |
| Future slot revocation | Shared rotation only | Per-user envelope | Per-device envelope |
| Revokes already copied keys/plaintext | No | No | No |
| Browser storage dependency | No | No | Usually yes |
| Best fit for first release | **Yes** | Possible evolution | Optional enhancement |

## Required follow-up decisions and validation

This research resolves the hierarchy direction but not every protocol
parameter. Before implementation tickets are ready:

1. Benchmark Argon2id profiles and the maintained browser/Wasm implementation
   on the supported mobile/desktop matrix.
2. Use the collaboration research to select one AEAD/document-key and nonce
   strategy; verify concurrent multi-client nonce safety.
3. Decide recovery custody and whether one or multiple recovery slots are
   required.
4. Prototype passphrase creation/unlock, wrong-secret/corrupt-envelope errors,
   skip-unlock behavior, lock timing, recovery export/confirmation, and
   smartphone entry.
5. Define who may administer unlock slots using the existing authorization
   model. This does not change which domain records roles may access.
6. Specify canonical binary serialization and associated data before writing
   production ciphertext.
7. Obtain independent cryptographic review of the combined key-management and
   collaboration protocol before claiming E2EE.

## Bottom line

The original shared-password hypothesis is viable for ElderFlow if the password
wraps a random organization key rather than encrypting content directly. The
durable architecture should be described as **an organization key with
multiple versioned unlock slots**, not as "shared-password encryption." That
name captures the stable boundary and leaves recovery, per-user envelopes, and
optional device convenience open without changing content ciphertext.

The most important limitation is non-revocation: no key hierarchy can make
plaintext or key material that an authorized former user already copied become
unknown. Rotation protects future access and future content; it does not erase
the past.

## Primary sources

- [RFC 9106: Argon2 Memory-Hard Function](https://www.rfc-editor.org/rfc/rfc9106.html)
- [RFC 5869: HKDF](https://www.rfc-editor.org/rfc/rfc5869.html)
- [RFC 9180: Hybrid Public Key Encryption](https://www.rfc-editor.org/rfc/rfc9180.html)
- [RFC 3394: AES Key Wrap](https://www.rfc-editor.org/rfc/rfc3394.html)
- [NIST SP 800-132: Password-Based Key Derivation](https://csrc.nist.gov/pubs/sp/800/132/final)
- [NIST SP 800-38D: GCM and GMAC](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [NIST SP 800-38F: Key Wrapping](https://csrc.nist.gov/pubs/sp/800/38/f/final)
- [NIST SP 800-63B: Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [W3C Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/)
- [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
- [Official libsodium.js implementation](https://github.com/jedisct1/libsodium.js)
