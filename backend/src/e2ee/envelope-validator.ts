import { Decoder, Encoder } from 'cbor-x';
import { HttpException, HttpStatus } from '@nestjs/common';
import { codedHttpException } from '../errors/coded-http.exception';

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const encoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });

export interface KeyEnvelopeMetadata {
  organizationId: string;
  primaryKeyId: string;
  wrappedKeyId: string;
}

export function decodeBase64UrlEnvelope(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length < 32 || decoded.length > 12_288 || decoded.toString('base64url') !== value) {
    throw codedHttpException(HttpStatus.BAD_REQUEST, 'E2EE_ENVELOPE_INVALID', 'Invalid E2EE envelope');
  }
  return decoded;
}

export function validateKeyEnvelope(encoded: Uint8Array, expectedKind: 1 | 2 | 3): KeyEnvelopeMetadata {
  try {
    const envelope = decoder.decode(encoded) as unknown;
    if (!Array.isArray(envelope) || envelope.length !== 6) invalid();
    if (envelope[0] !== 1) invalid('E2EE_FORMAT_UNSUPPORTED');
    if (envelope[2] !== 1) invalid('E2EE_SUITE_UNSUPPORTED');
    if (envelope[1] !== expectedKind || envelope[5] !== null || !Array.isArray(envelope[3])) invalid();
    const header = envelope[3] as unknown[];
    const ciphertext = bytes(envelope[4], 48);
    if (ciphertext.length !== 48) invalid();
    if (!sameBytes(Uint8Array.from(encoder.encode(envelope)), encoded)) invalid();

    if (expectedKind === 1) {
      if (header.length !== 8 || header[3] !== 1 || header[4] !== 3 || header[5] !== 67_108_864) invalid();
      bytes(header[6], 16);
      bytes(header[7], 24);
    } else if (expectedKind === 2) {
      if (header.length !== 5 || header[3] !== 1) invalid();
      bytes(header[4], 24);
    } else {
      if (header.length !== 5 || !Number.isInteger(header[3]) || (header[3] as number) < 1) invalid();
      bytes(header[4], 24);
    }

    return {
      organizationId: bytesToUuid(bytes(header[0], 16)),
      primaryKeyId: bytesToUuid(bytes(header[1], 16)),
      wrappedKeyId: bytesToUuid(bytes(header[2], 16)),
    };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    invalid();
  }
}

function bytes(value: unknown, expectedLength: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== expectedLength) invalid();
  return value;
}

function bytesToUuid(value: Uint8Array): string {
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function invalid(code = 'E2EE_ENVELOPE_INVALID'): never {
  throw codedHttpException(HttpStatus.BAD_REQUEST, code, 'Invalid E2EE envelope');
}
