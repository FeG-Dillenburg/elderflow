import { Decoder, Encoder } from 'cbor-x';
import sodium from 'libsodium-wrappers-sumo';
import { base64UrlToBytes, bytesToBase64Url, PASSPHRASE_KDF } from './protocol';

export const E2EE_FORMAT = 1;
export const E2EE_SUITE = 1;
export { PASSPHRASE_KDF } from './protocol';
const ENVELOPE_KIND = Object.freeze({
  sharedPassphraseSlot: 1,
  recoverySlot: 2,
  contentKeyWrapper: 3,
} as const);
const KEY_DERIVATION_PURPOSE = Object.freeze({
  contentKeyWrapper: 1,
  sharedPassphraseSlot: 2,
  recoverySlot: 3,
} as const);
const ORGANIZATION_AGGREGATE_ID = 0;

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });

export interface InitialKeyState {
  organizationId: string;
  orkId: string;
  ockId: string;
  sharedPassphraseSlot: string;
  recoverySlot: string;
  contentKeyWrapper: string;
  custodyCopiesAcknowledged: 2;
}

export interface GeneratedInitialKeyState {
  e2ee: InitialKeyState;
  recoveryText: string;
}

interface RecoveryWrapperInput {
  organizationId: string;
  slotId: string;
  orkId: string;
  recoverySecret: Uint8Array;
  organizationRootKey: Uint8Array;
  nonce: Uint8Array;
}

interface RecoveryWrapperResult {
  recoveryText: string;
  derivedKey: Uint8Array;
  envelope: Uint8Array;
}

export const deterministicCbor = (value: unknown): Uint8Array => Uint8Array.from(encoder.encode(value));

export function uuidToBytes(value: string): Uint8Array {
  const hex = value.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('E2EE_UUID_INVALID');
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export function bytesToUuid(value: Uint8Array): string {
  if (value.length !== 16) throw new Error('E2EE_UUID_INVALID');
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(inputKeyMaterial), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function encodeRecoverySecret(secret: Uint8Array): string {
  if (secret.length !== 32) throw new Error('E2EE_RECOVERY_SECRET_INVALID');
  return `EFR1.${bytesToBase64Url(secret)}`;
}

export function decodeRecoverySecret(value: string): Uint8Array {
  if (!/^EFR1\.[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('E2EE_RECOVERY_SECRET_INVALID');
  const decoded = base64UrlToBytes(value.slice(5));
  if (decoded.length !== 32 || encodeRecoverySecret(decoded) !== value) {
    throw new Error('E2EE_RECOVERY_SECRET_INVALID');
  }
  return decoded;
}

export async function createRecoveryWrapper(input: RecoveryWrapperInput): Promise<RecoveryWrapperResult> {
  await sodium.ready;
  assertLength(input.recoverySecret, 32);
  assertLength(input.organizationRootKey, 32);
  assertLength(input.nonce, 24);
  const organizationId = uuidToBytes(input.organizationId);
  const slotId = uuidToBytes(input.slotId);
  const header = [organizationId, slotId, uuidToBytes(input.orkId), 1, input.nonce];
  const info = deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.recoverySlot, ORGANIZATION_AGGREGATE_ID, slotId]);
  const derivedKey = await hkdfSha256(input.recoverySecret, organizationId, info);
  const associatedData = deterministicCbor([E2EE_FORMAT, ENVELOPE_KIND.recoverySlot, E2EE_SUITE, header]);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    input.organizationRootKey,
    associatedData,
    null,
    input.nonce,
    derivedKey,
    'uint8array',
  );
  return {
    recoveryText: encodeRecoverySecret(input.recoverySecret),
    derivedKey,
    envelope: deterministicCbor([E2EE_FORMAT, ENVELOPE_KIND.recoverySlot, E2EE_SUITE, header, ciphertext, null]),
  };
}

export async function createInitialKeyState(
  passphrase: string,
  signal?: AbortSignal,
): Promise<GeneratedInitialKeyState> {
  await sodium.ready;
  const organizationId = crypto.randomUUID();
  const sharedSlotId = crypto.randomUUID();
  const recoverySlotId = crypto.randomUUID();
  const orkId = crypto.randomUUID();
  const ockId = crypto.randomUUID();
  const organizationIdBytes = uuidToBytes(organizationId);
  const organizationRootKey = crypto.getRandomValues(new Uint8Array(32));
  const organizationContentKey = crypto.getRandomValues(new Uint8Array(32));
  const recoverySecret = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passphraseNonce = crypto.getRandomValues(new Uint8Array(24));
  const passphraseKey = await derivePassphraseKey(passphrase, salt, signal);

  try {
    const sharedHeader = [
      organizationIdBytes,
      uuidToBytes(sharedSlotId),
      uuidToBytes(orkId),
      PASSPHRASE_KDF.version,
      PASSPHRASE_KDF.operationsLimit,
      PASSPHRASE_KDF.memoryLimit,
      salt,
      passphraseNonce,
    ];
    const sharedWrappingKey = await hkdfSha256(
      passphraseKey,
      organizationIdBytes,
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.sharedPassphraseSlot, ORGANIZATION_AGGREGATE_ID, uuidToBytes(sharedSlotId)]),
    );
    const sharedCiphertext = encryptWrapper(ENVELOPE_KIND.sharedPassphraseSlot, sharedHeader, organizationRootKey, passphraseNonce, sharedWrappingKey);
    const sharedEnvelope = deterministicCbor([E2EE_FORMAT, ENVELOPE_KIND.sharedPassphraseSlot, E2EE_SUITE, sharedHeader, sharedCiphertext, null]);

    const recovery = await createRecoveryWrapper({
      organizationId,
      slotId: recoverySlotId,
      orkId,
      recoverySecret,
      organizationRootKey,
      nonce: crypto.getRandomValues(new Uint8Array(24)),
    });

    const contentNonce = crypto.getRandomValues(new Uint8Array(24));
    const contentHeader = [organizationIdBytes, uuidToBytes(orkId), uuidToBytes(ockId), 1, contentNonce];
    const contentWrappingKey = await hkdfSha256(
      organizationRootKey,
      organizationIdBytes,
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.contentKeyWrapper, ORGANIZATION_AGGREGATE_ID, uuidToBytes(ockId)]),
    );
    const contentCiphertext = encryptWrapper(ENVELOPE_KIND.contentKeyWrapper, contentHeader, organizationContentKey, contentNonce, contentWrappingKey);
    const contentEnvelope = deterministicCbor([E2EE_FORMAT, ENVELOPE_KIND.contentKeyWrapper, E2EE_SUITE, contentHeader, contentCiphertext, null]);

    sodium.memzero(sharedWrappingKey);
    sodium.memzero(contentWrappingKey);
    sodium.memzero(recovery.derivedKey);
    return {
      e2ee: {
        organizationId,
        orkId,
        ockId,
        sharedPassphraseSlot: bytesToBase64Url(sharedEnvelope),
        recoverySlot: bytesToBase64Url(recovery.envelope),
        contentKeyWrapper: bytesToBase64Url(contentEnvelope),
        custodyCopiesAcknowledged: 2,
      },
      recoveryText: recovery.recoveryText,
    };
  } finally {
    sodium.memzero(passphraseKey);
    sodium.memzero(organizationRootKey);
    sodium.memzero(organizationContentKey);
    sodium.memzero(recoverySecret);
  }
}

export interface PublicKeyState {
  envelopeFormat: 1;
  cryptoSuite: 1;
  organizationId: string;
  generation: number;
  orkId: string;
  ockId: string;
  ockEpoch: number;
  sharedPassphraseSlot: string;
  contentKeyWrapper: string;
  passphraseKdf: typeof PASSPHRASE_KDF;
}

export interface RecoveryKeyState extends PublicKeyState {
  recoverySlot: string;
}

export interface RecoveryCandidate {
  candidateSharedPassphraseSlot: string;
  candidateFingerprint: string;
}

export type PassphraseKeyDeriver = (passphrase: string, salt: Uint8Array, signal?: AbortSignal) => Promise<Uint8Array>;

export async function createRecoveryCandidate(
  recoveryText: string,
  newPassphrase: string,
  state: RecoveryKeyState,
  signal?: AbortSignal,
  derive: PassphraseKeyDeriver = derivePassphraseKey,
): Promise<RecoveryCandidate> {
  await sodium.ready;
  const organizationRootKey = await unlockOrganizationRootKeyWithRecovery(recoveryText, state);
  try {
    const candidateSharedPassphraseSlot = await createSharedPassphraseEnvelope(
      newPassphrase,
      state.organizationId,
      state.orkId,
      organizationRootKey,
      signal,
      derive,
    );
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(candidateSharedPassphraseSlot));
    return {
      candidateSharedPassphraseSlot: bytesToBase64Url(candidateSharedPassphraseSlot),
      candidateFingerprint: bytesToBase64Url(new Uint8Array(digest)),
    };
  } finally {
    sodium.memzero(organizationRootKey);
  }
}

export async function verifyRecoveryCandidate(
  recoveryText: string,
  newPassphrase: string,
  state: RecoveryKeyState,
  candidate: RecoveryCandidate,
  signal?: AbortSignal,
  derive: PassphraseKeyDeriver = derivePassphraseKey,
): Promise<boolean> {
  await sodium.ready;
  const organizationRootKey = await unlockOrganizationRootKeyWithRecovery(recoveryText, state);
  try {
    const envelope = decodeCanonicalEnvelope(candidate.candidateSharedPassphraseSlot, ENVELOPE_KIND.sharedPassphraseSlot);
    const header = envelope[3] as unknown[];
    const passphraseKey = await derive(newPassphrase, bytes(header[6], 16), signal);
    const wrappingKey = await hkdfSha256(
      passphraseKey,
      uuidToBytes(state.organizationId),
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.sharedPassphraseSlot, ORGANIZATION_AGGREGATE_ID, bytes(header[1], 16)]),
    );
    sodium.memzero(passphraseKey);
    const candidateRootKey = decryptWrapper(ENVELOPE_KIND.sharedPassphraseSlot, header, bytes(envelope[4], 48), bytes(header[7], 24), wrappingKey);
    sodium.memzero(wrappingKey);
    const matches = constantTimeEqual(organizationRootKey, candidateRootKey);
    sodium.memzero(candidateRootKey);
    const digest = new Uint8Array(await crypto.subtle.digest(
      'SHA-256',
      toArrayBuffer(base64UrlToBytes(candidate.candidateSharedPassphraseSlot)),
    ));
    return matches && bytesToBase64Url(digest) === candidate.candidateFingerprint;
  } catch {
    return false;
  } finally {
    sodium.memzero(organizationRootKey);
  }
}

export async function unlockWithPassphrase(
  passphrase: string,
  state: PublicKeyState,
  signal?: AbortSignal,
): Promise<{ organizationRootKey: Uint8Array; contentKey: Uint8Array }> {
  await sodium.ready;
  try {
    assertSupportedState(state);
    const shared = decodeCanonicalEnvelope(state.sharedPassphraseSlot, ENVELOPE_KIND.sharedPassphraseSlot);
    const sharedHeader = shared[3] as unknown[];
    const salt = bytes(sharedHeader[6], 16);
    const nonce = bytes(sharedHeader[7], 24);
    const passphraseKey = await derivePassphraseKey(passphrase, salt, signal);
    const wrappingKey = await hkdfSha256(
      passphraseKey,
      uuidToBytes(state.organizationId),
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.sharedPassphraseSlot, ORGANIZATION_AGGREGATE_ID, bytes(sharedHeader[1], 16)]),
    );
    sodium.memzero(passphraseKey);
    const organizationRootKey = decryptWrapper(ENVELOPE_KIND.sharedPassphraseSlot, sharedHeader, bytes(shared[4]), nonce, wrappingKey);
    sodium.memzero(wrappingKey);

    const content = decodeCanonicalEnvelope(state.contentKeyWrapper, ENVELOPE_KIND.contentKeyWrapper);
    const contentHeader = content[3] as unknown[];
    const contentNonce = bytes(contentHeader[4], 24);
    const contentWrappingKey = await hkdfSha256(
      organizationRootKey,
      uuidToBytes(state.organizationId),
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.contentKeyWrapper, ORGANIZATION_AGGREGATE_ID, bytes(contentHeader[2], 16)]),
    );
    const contentKey = decryptWrapper(ENVELOPE_KIND.contentKeyWrapper, contentHeader, bytes(content[4]), contentNonce, contentWrappingKey);
    sodium.memzero(contentWrappingKey);
    return { organizationRootKey, contentKey };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('E2EE_UNLOCK_FAILED');
  }
}

async function unlockOrganizationRootKeyWithRecovery(
  recoveryText: string,
  state: RecoveryKeyState,
): Promise<Uint8Array> {
  try {
    assertSupportedState(state);
    const secret = decodeRecoverySecret(recoveryText);
    const envelope = decodeCanonicalEnvelope(state.recoverySlot, ENVELOPE_KIND.recoverySlot);
    const header = envelope[3] as unknown[];
    const wrappingKey = await hkdfSha256(
      secret,
      uuidToBytes(state.organizationId),
      deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.recoverySlot, ORGANIZATION_AGGREGATE_ID, bytes(header[1], 16)]),
    );
    sodium.memzero(secret);
    const organizationRootKey = decryptWrapper(ENVELOPE_KIND.recoverySlot, header, bytes(envelope[4], 48), bytes(header[4], 24), wrappingKey);
    sodium.memzero(wrappingKey);
    return organizationRootKey;
  } catch {
    throw new Error('E2EE_RECOVERY_FAILED');
  }
}

async function createSharedPassphraseEnvelope(
  passphrase: string,
  organizationId: string,
  orkId: string,
  organizationRootKey: Uint8Array,
  signal?: AbortSignal,
  derive: PassphraseKeyDeriver = derivePassphraseKey,
): Promise<Uint8Array> {
  const slotId = crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const passphraseKey = await derive(passphrase, salt, signal);
  const header = [uuidToBytes(organizationId), uuidToBytes(slotId), uuidToBytes(orkId), PASSPHRASE_KDF.version, PASSPHRASE_KDF.operationsLimit, PASSPHRASE_KDF.memoryLimit, salt, nonce];
  const wrappingKey = await hkdfSha256(
    passphraseKey,
    uuidToBytes(organizationId),
    deterministicCbor(['ElderFlow key v1', KEY_DERIVATION_PURPOSE.sharedPassphraseSlot, ORGANIZATION_AGGREGATE_ID, uuidToBytes(slotId)]),
  );
  sodium.memzero(passphraseKey);
  const ciphertext = encryptWrapper(ENVELOPE_KIND.sharedPassphraseSlot, header, organizationRootKey, nonce, wrappingKey);
  sodium.memzero(wrappingKey);
  return deterministicCbor([E2EE_FORMAT, ENVELOPE_KIND.sharedPassphraseSlot, E2EE_SUITE, header, ciphertext, null]);
}

export function derivePassphraseKey(passphrase: string, salt: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) return Promise.reject(new DOMException('Operation aborted', 'AbortError'));
  if (typeof Worker === 'undefined') return Promise.reject(new Error('E2EE_WORKER_REQUIRED'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./argon2.worker.ts', import.meta.url), { type: 'module' });
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Operation aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ key?: ArrayBuffer; error?: string }>) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (data.error || !data.key) reject(new Error(data.error ?? 'E2EE_KDF_FAILED'));
      else resolve(new Uint8Array(data.key));
    };
    worker.onerror = () => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      reject(new Error('E2EE_KDF_FAILED'));
    };
    const workerSalt = Uint8Array.from(salt);
    worker.postMessage({ passphrase: passphrase.normalize('NFC'), salt: workerSalt }, [workerSalt.buffer]);
  });
}

export async function derivePassphraseKeyInCurrentContext(
  passphrase: string,
  salt: Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
  await sodium.ready;
  return sodium.crypto_pwhash(
    PASSPHRASE_KDF.outputLength,
    passphrase.normalize('NFC'),
    salt,
    PASSPHRASE_KDF.operationsLimit,
    PASSPHRASE_KDF.memoryLimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
    'uint8array',
  );
}

function encryptWrapper(kind: number, header: unknown[], plaintext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    deterministicCbor([E2EE_FORMAT, kind, E2EE_SUITE, header]),
    null,
    nonce,
    key,
    'uint8array',
  );
}

function decryptWrapper(kind: number, header: unknown[], ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    deterministicCbor([E2EE_FORMAT, kind, E2EE_SUITE, header]),
    nonce,
    key,
    'uint8array',
  );
}

function decodeCanonicalEnvelope(value: string, expectedKind: number): unknown[] {
  const encoded = base64UrlToBytes(value);
  const decoded = decoder.decode(encoded) as unknown;
  if (!Array.isArray(decoded) || decoded.length !== 6 || decoded[0] !== 1 || decoded[1] !== expectedKind || decoded[2] !== 1 || decoded[5] !== null) {
    throw new Error('E2EE_ENVELOPE_INVALID');
  }
  if (!constantTimeEqual(deterministicCbor(decoded), encoded)) throw new Error('E2EE_ENVELOPE_NON_CANONICAL');
  return decoded;
}

function assertSupportedState(state: PublicKeyState): void {
  if (state.envelopeFormat !== E2EE_FORMAT) throw new Error('E2EE_FORMAT_UNSUPPORTED');
  if (state.cryptoSuite !== E2EE_SUITE) throw new Error('E2EE_SUITE_UNSUPPORTED');
  if (state.passphraseKdf.version !== PASSPHRASE_KDF.version
    || state.passphraseKdf.operationsLimit !== PASSPHRASE_KDF.operationsLimit
    || state.passphraseKdf.memoryLimit !== PASSPHRASE_KDF.memoryLimit
    || state.passphraseKdf.outputLength !== 32) {
    throw new Error('E2EE_KDF_UNSUPPORTED');
  }
}

function bytes(value: unknown, length?: number): Uint8Array {
  if (!(value instanceof Uint8Array) || (length !== undefined && value.length !== length)) {
    throw new Error('E2EE_ENVELOPE_INVALID');
  }
  return value;
}

function assertLength(value: Uint8Array, expected: number): void {
  if (value.length !== expected) throw new Error('E2EE_BINARY_LENGTH_INVALID');
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
