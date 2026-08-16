import { Decoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { deterministicCbor, hkdfSha256, uuidToBytes } from "./crypto";

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const DOMAIN = new TextEncoder().encode("ElderFlow signed envelope v1\0");

interface AwarenessContext {
  organizationId: string;
  documentId: string;
  ockId: string;
  clientEpochId: string;
  awarenessClock: number;
  contentKey: Uint8Array;
}

export async function encryptMeetingAwareness(input: AwarenessContext & {
  noncePrefix: Uint8Array;
  signingPrivateKey: Uint8Array;
  plaintext: Uint8Array;
}): Promise<Uint8Array> {
  if (input.plaintext.length > 4_096) throw new Error("E2EE_AWARENESS_INVALID");
  await sodium.ready;
  const nonce = new Uint8Array(24);
  nonce.set(input.noncePrefix);
  new DataView(nonce.buffer).setBigUint64(16, BigInt(input.awarenessClock), false);
  const header = awarenessHeader(input, nonce);
  const key = await awarenessKey(input);
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      input.plaintext, deterministicCbor([1, 7, 1, header]), null, nonce, key, "uint8array",
    );
    const signature = sodium.crypto_sign_detached(
      join(DOMAIN, deterministicCbor([1, 7, 1, header, ciphertext])),
      input.signingPrivateKey,
      "uint8array",
    );
    return deterministicCbor([1, 7, 1, header, ciphertext, signature]);
  } finally { sodium.memzero(key); }
}

export async function decryptMeetingAwareness(input: AwarenessContext & {
  signingPublicKey: Uint8Array;
  envelope: Uint8Array;
}): Promise<Uint8Array> {
  await sodium.ready;
  const decoded = decoder.decode(input.envelope) as unknown;
  if (!Array.isArray(decoded) || decoded.length !== 6 || decoded[0] !== 1
    || decoded[1] !== 7 || decoded[2] !== 1 || !Array.isArray(decoded[3])) {
    throw new Error("E2EE_AWARENESS_INVALID");
  }
  const header = decoded[3] as unknown[];
  const nonce = bytes(header[6], 24);
  if (!sameHeader(header, awarenessHeader(input, nonce))) throw new Error("E2EE_AWARENESS_INVALID");
  const ciphertext = bytes(decoded[4]);
  const signature = bytes(decoded[5], 64);
  if (!sodium.crypto_sign_verify_detached(
    signature, join(DOMAIN, deterministicCbor([1, 7, 1, header, ciphertext])), input.signingPublicKey,
  )) throw new Error("E2EE_AWARENESS_INVALID");
  const key = await awarenessKey(input);
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, ciphertext, deterministicCbor([1, 7, 1, header]), nonce, key, "uint8array",
    );
  } finally { sodium.memzero(key); }
}

const awarenessHeader = (input: AwarenessContext, nonce: Uint8Array) => [
  uuidToBytes(input.organizationId), uuidToBytes(input.documentId), uuidToBytes(input.ockId),
  1, uuidToBytes(input.clientEpochId), input.awarenessClock, nonce,
];
const awarenessKey = (input: AwarenessContext) => hkdfSha256(
  input.contentKey,
  uuidToBytes(input.organizationId),
  deterministicCbor(["ElderFlow key v1", 22, 0, uuidToBytes(input.documentId)]),
);
const bytes = (value: unknown, length?: number) => {
  if (!ArrayBuffer.isView(value)) throw new Error("E2EE_AWARENESS_INVALID");
  const result = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (length !== undefined && result.length !== length) throw new Error("E2EE_AWARENESS_INVALID");
  return result;
};
const sameHeader = (left: unknown[], right: unknown[]) =>
  left.length === right.length && deterministicCbor(left).every((byte, index) => byte === deterministicCbor(right)[index]);
const join = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
