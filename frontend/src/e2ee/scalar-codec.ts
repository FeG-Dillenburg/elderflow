import { Decoder, Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { hkdfSha256, uuidToBytes } from "./crypto";
import { ScalarFieldContext } from "./scalar-registry";

const FORMAT = 1;
const KIND = 4;
const SUITE = 1;
const SCALAR_FORMAT = 1;
const SCALAR_PURPOSE = 10;
const SIGNATURE_DOMAIN = new TextEncoder().encode("ElderFlow signed envelope v1\0");
const PADDING_BUCKETS = [256, 1024, 4096, 16384, 65536, 262144, 1048576] as const;

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });

export type ScalarContext = ScalarFieldContext & {
  organizationId: string;
  ockId: string;
};

export type EncryptScalarInput = ScalarContext & {
  clientEpochId: string;
  writeCounter: number;
  noncePrefix: Uint8Array;
  contentKey: Uint8Array;
  signingPrivateKey: Uint8Array;
  value: string | null;
  randomBytes?: (length: number) => Uint8Array;
};

export type DecryptScalarInput = ScalarContext & {
  envelope: Uint8Array;
  contentKey: Uint8Array;
  signingPublicKey?: Uint8Array;
};

export async function encryptScalar(input: EncryptScalarInput): Promise<Uint8Array> {
  assertContext(input);
  assertBytes(input.contentKey, 32);
  assertBytes(input.signingPrivateKey, 64);
  assertBytes(input.noncePrefix, 16);
  if (!Number.isSafeInteger(input.writeCounter) || input.writeCounter < 1) invalid();

  await sodium.ready;
  const value = input.value === null
    ? new Uint8Array()
    : new TextEncoder().encode(input.value.normalize("NFC"));
  const plaintext = paddedPlaintext(input.value === null ? 0 : 1, value, input.randomBytes);
  const nonce = new Uint8Array(24);
  nonce.set(input.noncePrefix);
  new DataView(nonce.buffer).setBigUint64(16, BigInt(input.writeCounter), false);
  const header = [
    uuidToBytes(input.organizationId),
    input.aggregateType,
    uuidToBytes(input.recordId),
    input.fieldId,
    uuidToBytes(input.ockId),
    uuidToBytes(input.clientEpochId),
    input.writeCounter,
    nonce,
  ];
  const key = await scalarKey(input.contentKey, input);
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      encode([FORMAT, KIND, SUITE, header]),
      null,
      nonce,
      key,
      "uint8array",
    );
    const signedMessage = concatenate(
      SIGNATURE_DOMAIN,
      encode([FORMAT, KIND, SUITE, header, ciphertext]),
    );
    const signature = sodium.crypto_sign_detached(
      signedMessage,
      input.signingPrivateKey,
      "uint8array",
    );
    return encode([FORMAT, KIND, SUITE, header, ciphertext, signature]);
  } finally {
    sodium.memzero(key);
    sodium.memzero(plaintext);
  }
}

export async function decryptScalar(input: DecryptScalarInput): Promise<string | null> {
  try {
    assertContext(input);
    assertBytes(input.contentKey, 32);
    await sodium.ready;
    const envelope = decoder.decode(input.envelope) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6
      || envelope[0] !== FORMAT || envelope[1] !== KIND || envelope[2] !== SUITE
      || !Array.isArray(envelope[3])) invalid();
    if (!sameBytes(encode(envelope), input.envelope)) invalid();

    const header = envelope[3] as unknown[];
    if (header.length !== 8) invalid();
    const organizationId = bytes(header[0], 16);
    const aggregateType = integer(header[1], 256, 65_535);
    const recordId = bytes(header[2], 16);
    const fieldId = integer(header[3], 1, 65_535);
    const ockId = bytes(header[4], 16);
    bytes(header[5], 16);
    const writeCounter = integer(header[6], 1, Number.MAX_SAFE_INTEGER);
    const nonce = bytes(header[7], 24);
    const encodedCounter = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength)
      .getBigUint64(16, false);
    if (encodedCounter !== BigInt(writeCounter)) invalid();
    if (!sameBytes(organizationId, uuidToBytes(input.organizationId))
      || aggregateType !== input.aggregateType
      || !sameBytes(recordId, uuidToBytes(input.recordId))
      || fieldId !== input.fieldId
      || !sameBytes(ockId, uuidToBytes(input.ockId))) {
      throw new Error("E2EE_SCALAR_CONTEXT_INVALID");
    }

    const ciphertext = bytes(envelope[4]);
    const signature = bytes(envelope[5], 64);
    if (input.signingPublicKey) {
      assertBytes(input.signingPublicKey, 32);
      const signedMessage = concatenate(
        SIGNATURE_DOMAIN,
        encode([FORMAT, KIND, SUITE, header, ciphertext]),
      );
      if (!sodium.crypto_sign_verify_detached(signature, signedMessage, input.signingPublicKey)) invalid();
    }

    const key = await scalarKey(input.contentKey, input);
    try {
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        encode([FORMAT, KIND, SUITE, header]),
        nonce,
        key,
        "uint8array",
      );
      if (!PADDING_BUCKETS.includes(plaintext.length as (typeof PADDING_BUCKETS)[number])) invalid();
      const scalar = decoder.decode(plaintext) as unknown;
      if (!Array.isArray(scalar) || scalar.length !== 4 || scalar[0] !== SCALAR_FORMAT) invalid();
      const state = scalar[1];
      const utf8Value = bytes(scalar[2]);
      bytes(scalar[3]);
      if (state === 0) {
        if (utf8Value.length !== 0) invalid();
        return null;
      }
      if (state !== 1) invalid();
      return new TextDecoder("utf-8", { fatal: true }).decode(utf8Value);
    } finally {
      sodium.memzero(key);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "E2EE_SCALAR_CONTEXT_INVALID") throw error;
    throw new Error("E2EE_SCALAR_INVALID", { cause: error });
  }
}

function paddedPlaintext(
  state: 0 | 1,
  value: Uint8Array,
  randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
): Uint8Array {
  const emptyLength = encode([SCALAR_FORMAT, state, value, new Uint8Array()]).length;
  const bucket = PADDING_BUCKETS.find((candidate) => candidate >= emptyLength);
  if (!bucket) throw new Error("E2EE_SCALAR_TOO_LARGE");
  let paddingLength = bucket - emptyLength;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = encode([SCALAR_FORMAT, state, value, new Uint8Array(paddingLength)]);
    const difference = bucket - candidate.length;
    if (difference === 0) {
      const padding = randomBytes(paddingLength);
      assertBytes(padding, paddingLength);
      return encode([SCALAR_FORMAT, state, value, padding]);
    }
    paddingLength += difference;
    if (paddingLength < 0) break;
  }
  invalid();
}

async function scalarKey(contentKey: Uint8Array, context: ScalarContext): Promise<Uint8Array> {
  const aggregateId = new Uint8Array(18);
  aggregateId.set(uuidToBytes(context.recordId));
  new DataView(aggregateId.buffer).setUint16(16, context.fieldId, false);
  return hkdfSha256(
    contentKey,
    uuidToBytes(context.organizationId),
    encode(["ElderFlow key v1", SCALAR_PURPOSE, context.aggregateType, aggregateId]),
  );
}

function assertContext(context: ScalarContext): void {
  uuidToBytes(context.organizationId);
  uuidToBytes(context.recordId);
  uuidToBytes(context.ockId);
  integer(context.aggregateType, 256, 65_535);
  integer(context.fieldId, 1, 65_535);
}

function encode(value: unknown): Uint8Array {
  return Uint8Array.from(new Encoder({
    mapsAsObjects: false,
    structuredClone: false,
    tagUint8Array: false,
    useRecords: false,
  }).encode(value));
}

function bytes(value: unknown, expectedLength?: number): Uint8Array {
  const normalized = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : Object.prototype.toString.call(value) === "[object ArrayBuffer]"
      ? new Uint8Array(value as ArrayBuffer)
      : Array.isArray(value) && value.every((byte) =>
          Number.isInteger(byte) && byte >= 0 && byte <= 255)
        ? Uint8Array.from(value)
        : invalid();
  if (expectedLength !== undefined && normalized.length !== expectedLength) invalid();
  return normalized;
}

function assertBytes(value: Uint8Array, expectedLength: number): void {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) invalid();
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function concatenate(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function invalid(): never {
  throw new Error("E2EE_SCALAR_INVALID");
}
