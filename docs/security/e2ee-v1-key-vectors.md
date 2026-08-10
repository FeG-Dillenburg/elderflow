# ElderFlow E2EE v1 key vectors

The authoritative machine-readable fixture is [`e2ee-v1-key-vectors.json`](./e2ee-v1-key-vectors.json). Every byte string is lowercase hexadecimal and every authenticated structure is a deterministic-CBOR array.

## Primitive interoperability

- RFC 5869 SHA-256 case 1 produces `3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf`.
- RFC 8032 Ed25519 case 1 produces public key `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a` and the unchanged published empty-message signature.

## Shared-passphrase slot

The fixed NFC passphrase `correct horse battery staple`, salt `000102030405060708090a0b0c0d0e0f`, operations limit 3, and memory limit 67,108,864 produce this 32-byte Argon2id v1.3 result:

```text
0d1a3c6523c8f06e4e0af9c515aa5b5448cfebd6838f2d52c3d8b6ef8ddc3c2e
```

After purpose-2 HKDF and XChaCha20-Poly1305 wrapping, the complete envelope is:

```text
860101018850000000000000400080000000000000015000000000000040008000000000000006500000000000004000800000000000000301031a0400000050000102030405060708090a0b0c0d0e0f5818606162636465666768696a6b6c6d6e6f70717273747576775830d1f48079ebc620215397fdd53526777a993b247f458a22099246178d7a58d2fbe511bb089825c759f6b3bb4aa00db40ff6
```

## Recovery slot

The canonical external text is:

```text
EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
```

The complete purpose-3 recovery envelope is:

```text
8601020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f505152535455565758309e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5f6
```

## Organization Content Key wrapper

The purpose-1 wrapper binds ORK ID `…0003`, OCK ID `…0004`, and OCK epoch 1. Its complete envelope is:

```text
8601030185500000000000004000800000000000000150000000000000400080000000000000035000000000000040008000000000000004015818808182838485868788898a8b8c8d8e8f90919293949596975830f3d4df98842427b70a7863bfd9faaeac3515b6a4b4d14c662fee2f1bb20bd25f1ed8fee0f098ff94b0bd86698dc0d27af6
```

## Signed scalar and negative cases

The machine-readable fixture also pins a complete 256-byte padded null scalar, its client-epoch counter nonce, Ed25519 signature, and complete-envelope SHA-256. The Node reference test reconstructs every byte and verifies that changing the version, record context, or ciphertext invalidates the signature. The validator tests reject non-canonical/trailing encodings, wrong kinds, truncation, and unsupported framing; the Recovery Secret tests reject padding and alternate versions while keeping wrong-secret failures generic.

## Independent client epochs

Counter 1 under two independently random 16-byte prefixes produces distinct 24-byte nonces:

```text
c0c1c2c3c4c5c6c7c8c9cacbcccdcecf0000000000000001
d0d1d2d3d4d5d6d7d8d9dadbdcdddedf0000000000000001
```

The browser suite and Node reference suite compare the complete values. Negative tests reject trailing bytes, truncation, unknown version/kind context, wrong passphrases, wrong Recovery Secrets, and candidate mismatch before exposing key material.
