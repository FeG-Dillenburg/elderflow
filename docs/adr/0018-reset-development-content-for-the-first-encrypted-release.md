# Reset development content for the first encrypted release

The first Protected-text release may reset and reseed existing development-only domain content instead of implementing an in-place plaintext-to-ciphertext migration, because ElderFlow has no production data that must be preserved. The encrypted envelopes and collaborative document formats must still be explicitly versioned so future production upgrades can migrate without destructive resets.
