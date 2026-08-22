import { BadRequestException } from '@nestjs/common';
import { Decoder, Encoder } from 'cbor-x';
import type { KeyCeremonyOperation } from './e2ee-recovery-ceremony.entity';

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const operations: readonly KeyCeremonyOperation[] = [
  'lost_passphrase',
  'change_passphrase',
  'replace_recovery_secret',
  'rotate_root_key',
  'rotate_root_and_content_key',
];

export interface KeyCeremonyPayload {
  operation: KeyCeremonyOperation;
  reasonCode: string;
  expectedGeneration: number;
  orkId: string;
  ockId: string;
  ockEpoch: number;
  sharedPassphraseSlot: Buffer;
  recoverySlot: Buffer;
  contentKeyWrapper: Buffer;
  custodyCopiesAcknowledged: 0 | 2;
  historicalContentKeyWrappers?: Array<{ ockId: string; ockEpoch: number; wrapper: Buffer }>;
}

export function encodeKeyCeremonyPayload(candidate: KeyCeremonyPayload): Buffer {
  return Buffer.from(encoder.encode([
    1,
    candidate.operation,
    candidate.reasonCode,
    candidate.expectedGeneration,
    candidate.orkId,
    candidate.ockId,
    candidate.ockEpoch,
    candidate.sharedPassphraseSlot,
    candidate.recoverySlot,
    candidate.contentKeyWrapper,
    candidate.custodyCopiesAcknowledged,
    (candidate.historicalContentKeyWrappers ?? []).map((entry) => [entry.ockId, entry.ockEpoch, entry.wrapper]),
  ]));
}

export function decodeKeyCeremonyPayload(encoded: Uint8Array): KeyCeremonyPayload {
  try {
    if (encoded.length < 32 || encoded.length > 16_384) invalid();
    const value = decoder.decode(encoded) as unknown;
    if (!Array.isArray(value) || value.length !== 12 || value[0] !== 1) invalid();
    const operation = value[1];
    const reasonCode = value[2];
    const expectedGeneration = value[3];
    const orkId = value[4];
    const ockId = value[5];
    const ockEpoch = value[6];
    const custodyCopiesAcknowledged = value[10];
    if (typeof operation !== 'string' || !operations.includes(operation as KeyCeremonyOperation)) invalid();
    if (typeof reasonCode !== 'string' || !/^[a-z0-9_]{1,64}$/.test(reasonCode)) invalid();
    if (!Number.isInteger(expectedGeneration) || (expectedGeneration as number) < 1) invalid();
    if (!isUuid(orkId) || !isUuid(ockId)) invalid();
    if (!Number.isInteger(ockEpoch) || (ockEpoch as number) < 1) invalid();
    if (custodyCopiesAcknowledged !== 0 && custodyCopiesAcknowledged !== 2) invalid();
    const sharedPassphraseSlot = bytes(value[7]);
    const recoverySlot = bytes(value[8]);
    const contentKeyWrapper = bytes(value[9]);
    const candidate: KeyCeremonyPayload = {
      operation: operation as KeyCeremonyOperation,
      reasonCode,
      expectedGeneration: expectedGeneration as number,
      orkId,
      ockId,
      ockEpoch: ockEpoch as number,
      sharedPassphraseSlot,
      recoverySlot,
      contentKeyWrapper,
      custodyCopiesAcknowledged,
      ...decodeHistoricalWrappers(value[11]),
    };
    const canonical = encodeKeyCeremonyPayload(candidate);
    if (!canonical.equals(Buffer.from(encoded))) invalid();
    return candidate;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    invalid();
  }
}

function decodeHistoricalWrappers(value: unknown): Pick<KeyCeremonyPayload, 'historicalContentKeyWrappers'> {
  if (!Array.isArray(value)) invalid();
  const wrappers = value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !isUuid(entry[0])
      || !Number.isInteger(entry[1]) || (entry[1] as number) < 1) invalid();
    return { ockId: entry[0], ockEpoch: entry[1] as number, wrapper: bytes(entry[2]) };
  });
  return wrappers.length ? { historicalContentKeyWrappers: wrappers } : {};
}

function bytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) invalid();
  return Buffer.from(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function invalid(): never {
  throw new BadRequestException({
    code: 'E2EE_CANDIDATE_INVALID',
    message: 'Invalid key ceremony candidate',
  });
}
