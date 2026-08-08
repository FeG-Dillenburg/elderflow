declare module 'libsodium-wrappers-sumo' {
  interface SodiumSumo {
    readonly ready: Promise<void>;
    readonly crypto_pwhash_ALG_ARGON2ID13: number;
    crypto_pwhash(
      outputLength: number,
      password: Uint8Array,
      salt: Uint8Array,
      opslimit: number,
      memlimit: number,
      algorithm: number,
    ): Uint8Array;
    from_string(value: string): Uint8Array;
    memzero(value: Uint8Array): void;
    sodium_version_string(): string;
    to_hex(value: Uint8Array): string;
  }

  const sodium: SodiumSumo;
  export default sodium;
}
