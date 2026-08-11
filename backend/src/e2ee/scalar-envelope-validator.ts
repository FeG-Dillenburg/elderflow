import { HttpException, HttpStatus } from "@nestjs/common";
import { Decoder, Encoder } from "cbor-x";
import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";
import { codedHttpException } from "../errors/coded-http.exception";
import { ScalarFieldContext } from "./scalar-registry";

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const SIGNATURE_DOMAIN = Buffer.from("ElderFlow signed envelope v1\0");
const CIPHERTEXT_LENGTHS = new Set([272, 1040, 4112, 16400, 65552, 262160, 1048592]);

export type ExpectedScalarEnvelope = ScalarFieldContext & {
  organizationId: string;
  ockId: string;
  clientEpochId: string;
  noncePrefix: Buffer;
  signingPublicKey: Buffer;
};

export interface ScalarEnvelopeMetadata {
  clientEpochId: string;
  writeCounter: number;
  ciphertextLength: number;
  fingerprint: Buffer;
}

export function scalarEnvelopeClientEpochId(encoded: Buffer): string {
  try {
    const envelope = decoder.decode(encoded) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6 || !Array.isArray(envelope[3])) invalid();
    const header = envelope[3] as unknown[];
    if (header.length !== 8) invalid();
    return bytesToUuid(bytes(header[5], 16));
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

export function validateScalarEnvelope(
  encoded: Buffer,
  expected: ExpectedScalarEnvelope,
): ScalarEnvelopeMetadata {
  try {
    if (encoded.length < 256 || encoded.length > 1_050_000) invalid();
    const envelope = decoder.decode(encoded) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6) invalid();
    if (envelope[0] !== 1) invalid("E2EE_FORMAT_UNSUPPORTED");
    if (envelope[1] !== 4 || envelope[2] !== 1 || !Array.isArray(envelope[3])) invalid();
    if (!sameBytes(encode(envelope), encoded)) invalid();

    const header = envelope[3] as unknown[];
    if (header.length !== 8) invalid();
    const organizationId = bytesToUuid(bytes(header[0], 16));
    const aggregateType = integer(header[1], 256, 65_535);
    const recordId = bytesToUuid(bytes(header[2], 16));
    const fieldId = integer(header[3], 1, 65_535);
    const ockId = bytesToUuid(bytes(header[4], 16));
    const clientEpochId = bytesToUuid(bytes(header[5], 16));
    const writeCounter = integer(header[6], 1, Number.MAX_SAFE_INTEGER);
    const nonce = bytes(header[7], 24);
    const ciphertext = bytes(envelope[4]);
    const signature = bytes(envelope[5], 64);

    if (organizationId !== expected.organizationId
      || aggregateType !== expected.aggregateType
      || recordId !== expected.recordId
      || fieldId !== expected.fieldId
      || ockId !== expected.ockId
      || clientEpochId !== expected.clientEpochId) contextInvalid();
    if (!sameBytes(nonce.subarray(0, 16), expected.noncePrefix)) contextInvalid();
    if (nonce.readBigUInt64BE(16) !== BigInt(writeCounter)) invalid();
    if (!CIPHERTEXT_LENGTHS.has(ciphertext.length)) invalid();

    const signedMessage = Buffer.concat([
      SIGNATURE_DOMAIN,
      encode([1, 4, 1, header, ciphertext]),
    ]);
    if (!sodium.crypto_sign_verify_detached(
      signature,
      signedMessage,
      expected.signingPublicKey,
    )) invalid();

    return {
      clientEpochId,
      writeCounter,
      ciphertextLength: ciphertext.length,
      fingerprint: createHash("sha256").update(encoded).digest(),
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

function encode(value: unknown): Buffer {
  return Buffer.from(new Encoder({
    mapsAsObjects: false,
    structuredClone: false,
    tagUint8Array: false,
    useRecords: false,
  }).encode(value));
}

function bytes(value: unknown, expectedLength?: number): Buffer {
  if (!ArrayBuffer.isView(value)) invalid();
  const result = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (expectedLength !== undefined && result.length !== expectedLength) invalid();
  return result;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function bytesToUuid(value: Buffer): string {
  const hex = value.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function contextInvalid(): never {
  throw codedHttpException(
    HttpStatus.BAD_REQUEST,
    "E2EE_ENVELOPE_CONTEXT_INVALID",
    "Encrypted scalar belongs to a different context",
  );
}

function invalid(code = "E2EE_ENVELOPE_INVALID"): never {
  throw codedHttpException(HttpStatus.BAD_REQUEST, code, "Invalid encrypted scalar envelope");
}
