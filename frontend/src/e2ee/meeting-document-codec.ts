import { Decoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import * as Y from "yjs";
import {
  bytesToUuid,
  deterministicCbor,
  hkdfSha256,
  uuidToBytes,
} from "./crypto";

const ENVELOPE_FORMAT = 1;
const UPDATE_KIND = 5;
const SNAPSHOT_KIND = 6;
const CRYPTO_SUITE = 1;
export const MEETING_CODEC = 2;
const UPDATE_PURPOSE = 20;
const SNAPSHOT_PURPOSE = 21;
const SIGNATURE_DOMAIN = new TextEncoder().encode("ElderFlow signed envelope v1\0");
const MAX_UPDATE_LENGTH = 1_048_576;
const MAX_SNAPSHOT_LENGTH = 16_777_216;
const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });

export type MeetingFragmentRole =
  | "preparationContext"
  | "personNote"
  | "meetingMinutes";

export type StableMeetingFragment =
  | "meeting/general-notes"
  | "meeting/opening-input"
  | `appearance/${string}/preparation-context`
  | `appearance/${string}/person-note`
  | `appearance/${string}/minutes`;

interface MeetingUpdateContext {
  organizationId: string;
  documentId: string;
  activeSnapshotId: string;
  ockId: string;
  clientEpochId: string;
  authorClock: number;
  contentKey: Uint8Array;
}

export type CreateMeetingUpdateInput = MeetingUpdateContext & {
  noncePrefix: Uint8Array;
  signingPrivateKey: Uint8Array;
  update: Uint8Array;
};

export type ApplyMeetingUpdateInput = MeetingUpdateContext & {
  signingPublicKey: Uint8Array;
  envelope: Uint8Array;
};

export type CreateMeetingSnapshotInput = Omit<MeetingUpdateContext, "activeSnapshotId" | "authorClock"> & {
  snapshotId: string;
  parentSnapshotId: string;
  parentEnvelopeHash: Uint8Array;
  coveredServerSequence: number;
  coveredAuthorClocks: Array<[string, number]>;
  snapshotClock: number;
  noncePrefix: Uint8Array;
  signingPrivateKey: Uint8Array;
  document: Y.Doc;
};

export type ApplyMeetingSnapshotInput = Omit<MeetingUpdateContext, "activeSnapshotId" | "authorClock"> & {
  snapshotId: string;
  signingPublicKey: Uint8Array;
  envelope: Uint8Array;
};

export function meetingFragmentId(
  role: MeetingFragmentRole,
  appearanceId: string,
): StableMeetingFragment {
  if (role === "preparationContext") {
    return `appearance/${appearanceId}/preparation-context`;
  }
  if (role === "personNote") {
    return `appearance/${appearanceId}/person-note`;
  }
  return `appearance/${appearanceId}/minutes`;
}

export function readMeetingFragment(document: Y.Doc, fragment: StableMeetingFragment): string {
  return document.getText(fragment).toString();
}

export function replaceMeetingFragment(
  document: Y.Doc,
  fragment: StableMeetingFragment,
  value: string,
): Uint8Array {
  let update: Uint8Array | null = null;
  const origin = Symbol(fragment);
  const capture = (candidate: Uint8Array, candidateOrigin: unknown): void => {
    if (candidateOrigin === origin) update = Uint8Array.from(candidate);
  };
  document.on("updateV2", capture);
  document.transact(() => {
    const text = document.getText(fragment);
    if (text.length) text.delete(0, text.length);
    if (value) text.insert(0, value);
  }, origin);
  if (!update) {
    // An empty-to-empty replacement is a Yjs no-op. Preserve the empty value
    // while emitting a tombstone update for atomic fragment initialization.
    document.transact(() => {
      const text = document.getText(fragment);
      text.insert(0, "\0");
      text.delete(0, 1);
    }, origin);
  }
  document.off("updateV2", capture);
  return update ?? new Uint8Array();
}

export async function createEncryptedMeetingUpdate(
  input: CreateMeetingUpdateInput,
): Promise<Uint8Array> {
  assertLength(input.noncePrefix, 16);
  assertLength(input.contentKey, 32);
  assertLength(input.signingPrivateKey, 64);
  if (!Number.isSafeInteger(input.authorClock) || input.authorClock < 1) invalid();
  if (input.update.length === 0 || input.update.length > MAX_UPDATE_LENGTH) invalid();
  await sodium.ready;
  const nonce = new Uint8Array(24);
  nonce.set(input.noncePrefix);
  new DataView(nonce.buffer).setBigUint64(16, BigInt(input.authorClock), false);
  const header = updateHeader(input, nonce);
  const key = await meetingKey(input.contentKey, input.organizationId, input.documentId);
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      input.update,
      deterministicCbor([ENVELOPE_FORMAT, UPDATE_KIND, CRYPTO_SUITE, header]),
      null,
      nonce,
      key,
      "uint8array",
    );
    const signature = sodium.crypto_sign_detached(
      concatenate(
        SIGNATURE_DOMAIN,
        deterministicCbor([ENVELOPE_FORMAT, UPDATE_KIND, CRYPTO_SUITE, header, ciphertext]),
      ),
      input.signingPrivateKey,
      "uint8array",
    );
    return deterministicCbor([
      ENVELOPE_FORMAT,
      UPDATE_KIND,
      CRYPTO_SUITE,
      header,
      ciphertext,
      signature,
    ]);
  } finally {
    sodium.memzero(key);
  }
}

export async function applyEncryptedMeetingUpdate(
  document: Y.Doc,
  input: ApplyMeetingUpdateInput,
): Promise<void> {
  try {
    assertLength(input.contentKey, 32);
    assertLength(input.signingPublicKey, 32);
    await sodium.ready;
    const envelope = decoder.decode(input.envelope) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6
      || envelope[0] !== ENVELOPE_FORMAT || envelope[1] !== UPDATE_KIND
      || envelope[2] !== CRYPTO_SUITE || !Array.isArray(envelope[3])
      || !sameBytes(deterministicCbor(envelope), input.envelope)) invalid();
    const header = envelope[3] as unknown[];
    if (header.length !== 8) invalid();
    const expected = updateHeader(input, bytes(header[7], 24));
    if (!sameHeader(header, expected)) contextInvalid();
    const ciphertext = bytes(envelope[4]);
    if (ciphertext.length < 17 || ciphertext.length > MAX_UPDATE_LENGTH + 16) invalid();
    const signature = bytes(envelope[5], 64);
    const signed = concatenate(
      SIGNATURE_DOMAIN,
      deterministicCbor([ENVELOPE_FORMAT, UPDATE_KIND, CRYPTO_SUITE, header, ciphertext]),
    );
    if (!sodium.crypto_sign_verify_detached(signature, signed, input.signingPublicKey)) invalid();
    const key = await meetingKey(input.contentKey, input.organizationId, input.documentId);
    try {
      const update = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        deterministicCbor([ENVELOPE_FORMAT, UPDATE_KIND, CRYPTO_SUITE, header]),
        bytes(header[7], 24),
        key,
        "uint8array",
      );
      const probe = new Y.Doc();
      Y.applyUpdateV2(probe, update);
      probe.destroy();
      Y.applyUpdateV2(document, update);
    } finally {
      sodium.memzero(key);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "E2EE_MEETING_DOCUMENT_CONTEXT_INVALID") {
      throw error;
    }
    throw new Error("E2EE_MEETING_DOCUMENT_INVALID", { cause: error });
  }
}

export async function createEncryptedMeetingSnapshot(
  input: CreateMeetingSnapshotInput,
): Promise<Uint8Array> {
  assertLength(input.parentEnvelopeHash, 32);
  assertLength(input.noncePrefix, 16);
  assertLength(input.contentKey, 32);
  assertLength(input.signingPrivateKey, 64);
  if (!Number.isSafeInteger(input.snapshotClock) || input.snapshotClock < 1
    || !Number.isSafeInteger(input.coveredServerSequence) || input.coveredServerSequence < 0) invalid();
  const plaintext = Y.encodeStateAsUpdateV2(input.document);
  if (plaintext.length > MAX_SNAPSHOT_LENGTH) invalid();
  await sodium.ready;
  const nonce = new Uint8Array(24);
  nonce.set(input.noncePrefix);
  new DataView(nonce.buffer).setBigUint64(16, BigInt(input.snapshotClock), false);
  const header = snapshotHeader(input, nonce);
  const key = await meetingKey(
    input.contentKey,
    input.organizationId,
    input.documentId,
    SNAPSHOT_PURPOSE,
  );
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      deterministicCbor([ENVELOPE_FORMAT, SNAPSHOT_KIND, CRYPTO_SUITE, header]),
      null,
      nonce,
      key,
      "uint8array",
    );
    const signature = sodium.crypto_sign_detached(
      concatenate(
        SIGNATURE_DOMAIN,
        deterministicCbor([ENVELOPE_FORMAT, SNAPSHOT_KIND, CRYPTO_SUITE, header, ciphertext]),
      ),
      input.signingPrivateKey,
      "uint8array",
    );
    return deterministicCbor([
      ENVELOPE_FORMAT,
      SNAPSHOT_KIND,
      CRYPTO_SUITE,
      header,
      ciphertext,
      signature,
    ]);
  } finally {
    sodium.memzero(key);
  }
}

export async function applyEncryptedMeetingSnapshot(
  document: Y.Doc,
  input: ApplyMeetingSnapshotInput,
): Promise<void> {
  try {
    assertLength(input.contentKey, 32);
    assertLength(input.signingPublicKey, 32);
    await sodium.ready;
    const envelope = decoder.decode(input.envelope) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6
      || envelope[0] !== ENVELOPE_FORMAT || envelope[1] !== SNAPSHOT_KIND
      || envelope[2] !== CRYPTO_SUITE || !Array.isArray(envelope[3])
      || !sameBytes(deterministicCbor(envelope), input.envelope)) invalid();
    const header = envelope[3] as unknown[];
    if (header.length !== 12
      || bytesToUuid(bytes(header[0], 16)) !== input.organizationId
      || bytesToUuid(bytes(header[1], 16)) !== input.documentId
      || bytesToUuid(bytes(header[2], 16)) !== input.snapshotId
      || bytesToUuid(bytes(header[7], 16)) !== input.ockId
      || header[8] !== MEETING_CODEC
      || bytesToUuid(bytes(header[9], 16)) !== input.clientEpochId) contextInvalid();
    bytes(header[3], 16);
    bytes(header[4], 32);
    integer(header[5], 0);
    validateAuthorClocks(header[6]);
    const snapshotClock = integer(header[10], 1);
    const nonce = bytes(header[11], 24);
    if (new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength).getBigUint64(16, false)
      !== BigInt(snapshotClock)) invalid();
    const ciphertext = bytes(envelope[4]);
    if (ciphertext.length < 17 || ciphertext.length > MAX_SNAPSHOT_LENGTH + 16) invalid();
    const signature = bytes(envelope[5], 64);
    const signed = concatenate(
      SIGNATURE_DOMAIN,
      deterministicCbor([ENVELOPE_FORMAT, SNAPSHOT_KIND, CRYPTO_SUITE, header, ciphertext]),
    );
    if (!sodium.crypto_sign_verify_detached(signature, signed, input.signingPublicKey)) invalid();
    const key = await meetingKey(
      input.contentKey,
      input.organizationId,
      input.documentId,
      SNAPSHOT_PURPOSE,
    );
    try {
      const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        deterministicCbor([ENVELOPE_FORMAT, SNAPSHOT_KIND, CRYPTO_SUITE, header]),
        nonce,
        key,
        "uint8array",
      );
      const probe = new Y.Doc();
      Y.applyUpdateV2(probe, plaintext);
      probe.destroy();
      Y.applyUpdateV2(document, plaintext);
    } finally {
      sodium.memzero(key);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "E2EE_MEETING_DOCUMENT_CONTEXT_INVALID") {
      throw error;
    }
    throw new Error("E2EE_MEETING_DOCUMENT_INVALID", { cause: error });
  }
}

function updateHeader(input: MeetingUpdateContext, nonce: Uint8Array): unknown[] {
  const counter = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength)
    .getBigUint64(16, false);
  if (counter !== BigInt(input.authorClock)) contextInvalid();
  return [
    uuidToBytes(input.organizationId),
    uuidToBytes(input.documentId),
    uuidToBytes(input.activeSnapshotId),
    uuidToBytes(input.ockId),
    MEETING_CODEC,
    uuidToBytes(input.clientEpochId),
    input.authorClock,
    nonce,
  ];
}

async function meetingKey(
  contentKey: Uint8Array,
  organizationId: string,
  documentId: string,
  purpose = UPDATE_PURPOSE,
): Promise<Uint8Array> {
  return hkdfSha256(
    contentKey,
    uuidToBytes(organizationId),
    deterministicCbor(["ElderFlow key v1", purpose, 0, uuidToBytes(documentId)]),
  );
}

function snapshotHeader(input: CreateMeetingSnapshotInput, nonce: Uint8Array): unknown[] {
  const clocks = [...input.coveredAuthorClocks]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([clientEpochId, clock]) => [uuidToBytes(clientEpochId), integer(clock, 1)]);
  return [
    uuidToBytes(input.organizationId),
    uuidToBytes(input.documentId),
    uuidToBytes(input.snapshotId),
    uuidToBytes(input.parentSnapshotId),
    input.parentEnvelopeHash,
    input.coveredServerSequence,
    clocks,
    uuidToBytes(input.ockId),
    MEETING_CODEC,
    uuidToBytes(input.clientEpochId),
    input.snapshotClock,
    nonce,
  ];
}

function validateAuthorClocks(value: unknown): void {
  if (!Array.isArray(value)) invalid();
  let previous = "";
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) invalid();
    const id = bytesToUuid(bytes(entry[0], 16));
    integer(entry[1], 1);
    if (id <= previous) invalid();
    previous = id;
  }
}

function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function sameHeader(actual: unknown[], expected: unknown[]): boolean {
  try {
    return bytesToUuid(bytes(actual[0], 16)) === bytesToUuid(bytes(expected[0], 16))
      && bytesToUuid(bytes(actual[1], 16)) === bytesToUuid(bytes(expected[1], 16))
      && bytesToUuid(bytes(actual[2], 16)) === bytesToUuid(bytes(expected[2], 16))
      && bytesToUuid(bytes(actual[3], 16)) === bytesToUuid(bytes(expected[3], 16))
      && actual[4] === expected[4]
      && bytesToUuid(bytes(actual[5], 16)) === bytesToUuid(bytes(expected[5], 16))
      && actual[6] === expected[6]
      && sameBytes(bytes(actual[7], 24), bytes(expected[7], 24));
  } catch {
    return false;
  }
}

function bytes(value: unknown, length?: number): Uint8Array {
  if (!ArrayBuffer.isView(value)) invalid();
  const result = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (length !== undefined && result.length !== length) invalid();
  return result;
}

function assertLength(value: Uint8Array, length: number): void {
  if (!(value instanceof Uint8Array) || value.length !== length) invalid();
}

function concatenate(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
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

function contextInvalid(): never {
  throw new Error("E2EE_MEETING_DOCUMENT_CONTEXT_INVALID");
}

function invalid(): never {
  throw new Error("E2EE_MEETING_DOCUMENT_INVALID");
}
