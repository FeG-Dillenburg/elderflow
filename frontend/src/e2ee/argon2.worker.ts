import { PASSPHRASE_KDF } from './protocol';

type Sodium = typeof import('libsodium-wrappers-sumo');
let sodiumPromise: Promise<Sodium> | null = null;

function loadWasmSodium(): Promise<Sodium> {
  if (sodiumPromise) return sodiumPromise;
  sodiumPromise = (async () => {
    if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') {
      throw new Error('E2EE_WASM_REQUIRED');
    }
    let instantiatedWasm = false;
    const instantiate = WebAssembly.instantiate.bind(WebAssembly);
    const instantiateStreaming = WebAssembly.instantiateStreaming?.bind(WebAssembly);
    WebAssembly.instantiate = (async (...args: Parameters<typeof WebAssembly.instantiate>) => {
      const result = await instantiate(...args);
      instantiatedWasm = true;
      return result;
    }) as typeof WebAssembly.instantiate;
    if (instantiateStreaming) {
      WebAssembly.instantiateStreaming = (async (...args: Parameters<typeof WebAssembly.instantiateStreaming>) => {
        const result = await instantiateStreaming(...args);
        instantiatedWasm = true;
        return result;
      }) as typeof WebAssembly.instantiateStreaming;
    }
    try {
      const loaded = await import('libsodium-wrappers-sumo');
      const sodium = ((loaded as unknown as { default?: Sodium }).default ?? loaded) as Sodium;
      await sodium.ready;
      if (!instantiatedWasm) throw new Error('E2EE_WASM_REQUIRED');
      return sodium;
    } finally {
      WebAssembly.instantiate = instantiate;
      if (instantiateStreaming) WebAssembly.instantiateStreaming = instantiateStreaming;
    }
  })();
  return sodiumPromise;
}

self.onmessage = async ({ data }: MessageEvent<{ passphrase: string; salt: Uint8Array }>) => {
  try {
    const sodium = await loadWasmSodium();
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
