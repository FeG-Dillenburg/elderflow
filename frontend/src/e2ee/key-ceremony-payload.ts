import { Decoder, Encoder } from 'cbor-x';
import { base64UrlToBytes, bytesToBase64Url } from './protocol';

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });

export type KeyCeremonyOperation =
  | 'lost_passphrase'
  | 'change_passphrase'
  | 'replace_recovery_secret'
  | 'rotate_root_key'
  | 'rotate_root_and_content_key';

export interface KeyCeremonyPayload {
  operation: KeyCeremonyOperation;
  reasonCode: string;
  expectedGeneration: number;
  orkId: string;
  ockId: string;
  ockEpoch: number;
  sharedPassphraseSlot: string;
  recoverySlot: string;
  contentKeyWrapper: string;
  custodyCopiesAcknowledged: 0 | 2;
  historicalContentKeyWrappers?: Array<{ ockId: string; ockEpoch: number; wrapper: string }>;
}

export function encodeKeyCeremonyPayload(candidate: KeyCeremonyPayload): Uint8Array {
  return Uint8Array.from(encoder.encode([
    1,
    candidate.operation,
    candidate.reasonCode,
    candidate.expectedGeneration,
    candidate.orkId,
    candidate.ockId,
    candidate.ockEpoch,
    base64UrlToBytes(candidate.sharedPassphraseSlot),
    base64UrlToBytes(candidate.recoverySlot),
    base64UrlToBytes(candidate.contentKeyWrapper),
    candidate.custodyCopiesAcknowledged,
    (candidate.historicalContentKeyWrappers ?? []).map((entry) => [
      entry.ockId,
      entry.ockEpoch,
      base64UrlToBytes(entry.wrapper),
    ]),
  ]));
}

export function decodeKeyCeremonyPayload(encoded: Uint8Array): KeyCeremonyPayload {
  try {
    const value = decoder.decode(encoded) as unknown;
    if (!Array.isArray(value) || value.length !== 12 || value[0] !== 1) invalid();
    const operation = value[1];
    if (![
      'lost_passphrase',
      'change_passphrase',
      'replace_recovery_secret',
      'rotate_root_key',
      'rotate_root_and_content_key',
    ].includes(operation as string)) invalid();
    if (typeof value[2] !== 'string' || !Number.isInteger(value[3])
      || typeof value[4] !== 'string' || typeof value[5] !== 'string'
      || !Number.isInteger(value[6]) || (value[10] !== 0 && value[10] !== 2)) invalid();
    const candidate: KeyCeremonyPayload = {
      operation: operation as KeyCeremonyOperation,
      reasonCode: value[2],
      expectedGeneration: value[3],
      orkId: value[4],
      ockId: value[5],
      ockEpoch: value[6],
      sharedPassphraseSlot: bytesToBase64Url(bytes(value[7])),
      recoverySlot: bytesToBase64Url(bytes(value[8])),
      contentKeyWrapper: bytesToBase64Url(bytes(value[9])),
      custodyCopiesAcknowledged: value[10],
      ...decodeHistoricalWrappers(value[11]),
    };
    const canonical = encodeKeyCeremonyPayload(candidate);
    if (!sameBytes(canonical, encoded)) invalid();
    return candidate;
  } catch {
    return invalid();
  }
}

function decodeHistoricalWrappers(value: unknown): Pick<KeyCeremonyPayload, 'historicalContentKeyWrappers'> {
  if (!Array.isArray(value)) invalid();
  const wrappers = value.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string'
      || !Number.isInteger(entry[1])) invalid();
    return { ockId: entry[0], ockEpoch: entry[1], wrapper: bytesToBase64Url(bytes(entry[2])) };
  });
  return wrappers.length ? { historicalContentKeyWrappers: wrappers } : {};
}

function bytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) invalid();
  return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function invalid(): never {
  throw new Error('E2EE_CANDIDATE_INVALID');
}
