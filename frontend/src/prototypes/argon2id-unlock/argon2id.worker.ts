import type { WorkerResponse } from './benchmark';

interface InitializeRequest {
  type: 'initialize';
  disableWasm: boolean;
}

interface DeriveRequest {
  type: 'derive';
  requestId: string;
  profile: {
    outputLength: number;
    opslimit: number;
    memlimit: number;
    saltHex: string;
    passphrase: string;
    expectedHex: string;
  };
}

type WorkerRequest = InitializeRequest | DeriveRequest;

let sodium: typeof import('libsodium-wrappers-sumo').default | null = null;

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

function bytesFromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'initialize') {
    const startedAt = performance.now();
    const wasmAvailableBeforeProbe = typeof WebAssembly !== 'undefined';

    try {
      if (request.disableWasm) {
        Object.defineProperty(globalThis, 'WebAssembly', {
          configurable: true,
          value: undefined,
        });
      }

      const module = await import('libsodium-wrappers-sumo');
      sodium = module.default;
      await sodium.ready;
      post({
        type: 'ready',
        sodiumVersion: sodium.sodium_version_string(),
        wasmAvailableBeforeProbe,
        wasmDisabledForProbe: request.disableWasm,
        initializationMs: performance.now() - startedAt,
      });
    } catch (error) {
      post({
        type: 'failure',
        requestId: null,
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (!sodium) {
    post({
      type: 'failure',
      requestId: request.requestId,
      name: 'NotInitializedError',
      message: 'The worker must initialize the pinned runtime before deriving a key.',
    });
    return;
  }

  const profileExact = request.profile.outputLength === 32
    && request.profile.opslimit === 3
    && request.profile.memlimit === 67_108_864
    && request.profile.saltHex.length === 32;

  try {
    const password = sodium.from_string(request.profile.passphrase.normalize('NFC'));
    const salt = bytesFromHex(request.profile.saltHex);
    const startedAt = performance.now();
    const output = sodium.crypto_pwhash(
      request.profile.outputLength,
      password,
      salt,
      request.profile.opslimit,
      request.profile.memlimit,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
    const durationMs = performance.now() - startedAt;
    const outputHex = sodium.to_hex(output);
    sodium.memzero(password);
    sodium.memzero(output);

    post({
      type: 'result',
      requestId: request.requestId,
      durationMs,
      outputHex,
      matchesReference: outputHex === request.profile.expectedHex,
      profileExact,
    });
  } catch (error) {
    post({
      type: 'failure',
      requestId: request.requestId,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
