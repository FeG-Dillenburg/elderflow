import sodium from 'libsodium-wrappers-sumo';

const PASSPHRASE_KDF = {
  operationsLimit: 3,
  memoryLimit: 67_108_864,
  outputLength: 32,
} as const;

self.onmessage = async ({ data }: MessageEvent<{ passphrase: string; salt: Uint8Array }>) => {
  try {
    await sodium.ready;
    const key = sodium.crypto_pwhash(
      PASSPHRASE_KDF.outputLength,
      data.passphrase.normalize('NFC'),
      data.salt,
      PASSPHRASE_KDF.operationsLimit,
      PASSPHRASE_KDF.memoryLimit,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
      'uint8array',
    );
    self.postMessage({ key: key.buffer }, { transfer: [key.buffer] });
  } catch {
    self.postMessage({ error: 'E2EE_KDF_FAILED' });
  }
};
