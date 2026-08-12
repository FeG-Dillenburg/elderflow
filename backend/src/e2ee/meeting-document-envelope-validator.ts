import { HttpException, HttpStatus } from "@nestjs/common";
import { Decoder, Encoder } from "cbor-x";
import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers-sumo";
import { codedHttpException } from "../errors/coded-http.exception";

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const SIGNATURE_DOMAIN = Buffer.from("ElderFlow signed envelope v1\0");
const MAX_UPDATE_CIPHERTEXT = 1_048_592;

export interface ExpectedMeetingUpdateEnvelope {
  organizationId: string;
  documentId: string;
  activeSnapshotId: string;
  ockId: string;
  clientEpochId: string;
  noncePrefix: Buffer;
  signingPublicKey: Buffer;
}

export interface MeetingUpdateMetadata {
  clientEpochId: string;
  authorClock: number;
  ciphertextLength: number;
  fingerprint: Buffer;
}

export interface ExpectedMeetingSnapshotEnvelope {
  organizationId: string;
  documentId: string;
  snapshotId: string;
  ockId: string;
  clientEpochId: string;
  noncePrefix: Buffer;
  signingPublicKey: Buffer;
}

export interface MeetingSnapshotMetadata {
  parentSnapshotId: string;
  parentEnvelopeHash: Buffer;
  coveredServerSequence: number;
  coveredAuthorClocks: Array<[string, number]>;
  clientEpochId: string;
  snapshotClock: number;
  fingerprint: Buffer;
}

export function meetingUpdateClientEpochId(encoded: Buffer): string {
  try {
    const envelope = decodeEnvelope(encoded);
    const header = envelope[3] as unknown[];
    return bytesToUuid(bytes(header[5], 16));
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

export function meetingSnapshotClientEpochId(encoded: Buffer): string {
  try {
    const envelope = decodeEnvelope(encoded);
    const header = envelope[3] as unknown[];
    if (envelope[1] !== 6 || header.length !== 12) invalid();
    return bytesToUuid(bytes(header[9], 16));
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

export function validateMeetingSnapshotEnvelope(
  encoded: Buffer,
  expected: ExpectedMeetingSnapshotEnvelope,
): MeetingSnapshotMetadata {
  try {
    if (encoded.length > 16_800_000) invalid("E2EE_SNAPSHOT_TOO_LARGE");
    const envelope = decodeEnvelope(encoded);
    if (envelope[0] !== 1) invalid("E2EE_FORMAT_UNSUPPORTED");
    if (envelope[1] !== 6 || envelope[2] !== 1) invalid();
    if (!sameBytes(encode(envelope), encoded)) invalid();
    const header = envelope[3] as unknown[];
    if (header.length !== 12) invalid();
    const organizationId = bytesToUuid(bytes(header[0], 16));
    const documentId = bytesToUuid(bytes(header[1], 16));
    const snapshotId = bytesToUuid(bytes(header[2], 16));
    const parentSnapshotId = bytesToUuid(bytes(header[3], 16));
    const parentEnvelopeHash = bytes(header[4], 32);
    const coveredServerSequence = integer(header[5], 0, Number.MAX_SAFE_INTEGER);
    const coveredAuthorClocks = authorClocks(header[6]);
    const ockId = bytesToUuid(bytes(header[7], 16));
    if (header[8] !== 2) invalid("E2EE_CODEC_UNSUPPORTED");
    const clientEpochId = bytesToUuid(bytes(header[9], 16));
    const snapshotClock = integer(header[10], 1, Number.MAX_SAFE_INTEGER);
    const nonce = bytes(header[11], 24);
    const ciphertext = bytes(envelope[4]);
    const signature = bytes(envelope[5], 64);
    if (organizationId !== expected.organizationId
      || documentId !== expected.documentId
      || snapshotId !== expected.snapshotId
      || ockId !== expected.ockId
      || clientEpochId !== expected.clientEpochId
      || !sameBytes(nonce.subarray(0, 16), expected.noncePrefix)) contextInvalid();
    if (nonce.readBigUInt64BE(16) !== BigInt(snapshotClock)) invalid();
    if (ciphertext.length < 17 || ciphertext.length > 16_777_232) {
      invalid("E2EE_SNAPSHOT_TOO_LARGE");
    }
    const signed = Buffer.concat([
      SIGNATURE_DOMAIN,
      encode([1, 6, 1, header, ciphertext]),
    ]);
    if (!sodium.crypto_sign_verify_detached(signature, signed, expected.signingPublicKey)) invalid();
    return {
      parentSnapshotId,
      parentEnvelopeHash,
      coveredServerSequence,
      coveredAuthorClocks,
      clientEpochId,
      snapshotClock,
      fingerprint: createHash("sha256").update(encoded).digest(),
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

export function validateMeetingUpdateEnvelope(
  encoded: Buffer,
  expected: ExpectedMeetingUpdateEnvelope,
): MeetingUpdateMetadata {
  try {
    if (encoded.length > 1_050_000) invalid("E2EE_UPDATE_TOO_LARGE");
    const envelope = decodeEnvelope(encoded);
    if (envelope[0] !== 1) invalid("E2EE_FORMAT_UNSUPPORTED");
    if (envelope[1] !== 5 || envelope[2] !== 1) invalid();
    if (!sameBytes(encode(envelope), encoded)) invalid();
    const header = envelope[3] as unknown[];
    if (header.length !== 8) invalid();
    const organizationId = bytesToUuid(bytes(header[0], 16));
    const documentId = bytesToUuid(bytes(header[1], 16));
    const activeSnapshotId = bytesToUuid(bytes(header[2], 16));
    const ockId = bytesToUuid(bytes(header[3], 16));
    if (header[4] !== 2) invalid("E2EE_CODEC_UNSUPPORTED");
    const clientEpochId = bytesToUuid(bytes(header[5], 16));
    const authorClock = integer(header[6], 1, Number.MAX_SAFE_INTEGER);
    const nonce = bytes(header[7], 24);
    const ciphertext = bytes(envelope[4]);
    const signature = bytes(envelope[5], 64);
    if (organizationId !== expected.organizationId
      || documentId !== expected.documentId
      || activeSnapshotId !== expected.activeSnapshotId
      || ockId !== expected.ockId
      || clientEpochId !== expected.clientEpochId
      || !sameBytes(nonce.subarray(0, 16), expected.noncePrefix)) contextInvalid();
    if (nonce.readBigUInt64BE(16) !== BigInt(authorClock)) invalid();
    if (ciphertext.length < 17 || ciphertext.length > MAX_UPDATE_CIPHERTEXT) {
      invalid("E2EE_UPDATE_TOO_LARGE");
    }
    const signed = Buffer.concat([
      SIGNATURE_DOMAIN,
      encode([1, 5, 1, header, ciphertext]),
    ]);
    if (!sodium.crypto_sign_verify_detached(signature, signed, expected.signingPublicKey)) invalid();
    return {
      clientEpochId,
      authorClock,
      ciphertextLength: ciphertext.length,
      fingerprint: createHash("sha256").update(encoded).digest(),
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

function decodeEnvelope(encoded: Buffer): unknown[] {
  const envelope = decoder.decode(encoded) as unknown;
  if (!Array.isArray(envelope) || envelope.length !== 6 || !Array.isArray(envelope[3])) invalid();
  return envelope;
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

function authorClocks(value: unknown): Array<[string, number]> {
  if (!Array.isArray(value)) invalid();
  let previous = "";
  return value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) invalid();
    const id = bytesToUuid(bytes(entry[0], 16));
    const clock = integer(entry[1], 1, Number.MAX_SAFE_INTEGER);
    if (id <= previous) invalid();
    previous = id;
    return [id, clock];
  });
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
    "Encrypted Meeting document belongs to a different context",
  );
}

function invalid(code = "E2EE_ENVELOPE_INVALID"): never {
  throw codedHttpException(
    HttpStatus.BAD_REQUEST,
    code,
    "Invalid encrypted Meeting document envelope",
  );
}
