import { BadRequestException } from "@nestjs/common";
import { Decoder, Encoder } from "cbor-x";
import { MeetingDto, MeetingTopicDto } from "./dto/meeting.dto";

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function decodeMeetingCreateBody(body: Buffer): MeetingDto {
  if (!Buffer.isBuffer(body) || body.length > 16_900_000) invalid();
  let value: unknown;
  try {
    value = decoder.decode(body);
  } catch {
    invalid();
  }
  if (!Array.isArray(value)
    || value.length !== 10
    || !Buffer.from(encoder.encode(value)).equals(body)
    || !isUuid(value[0])
    || !(value[1] instanceof Uint8Array)
    || !isUuid(value[2])
    || !isUuid(value[3])
    || !(value[4] instanceof Uint8Array)
    || typeof value[5] !== "string"
    || typeof value[6] !== "string"
    || !["planned", "in_progress"].includes(String(value[7]))
    || !isNullableUuid(value[8])
    || !isNullableUuid(value[9])) {
    invalid();
  }
  return {
    id: value[0],
    protected: { titleEnvelope: Buffer.from(value[1]).toString("base64url") },
    document: {
      documentId: value[2],
      snapshotId: value[3],
      snapshotEnvelope: Buffer.from(value[4]).toString("base64url"),
    },
    date: value[5],
    beginTime: value[6],
    status: value[7],
    meetingLeaderId: value[8],
    minuteTakerId: value[9],
  } as MeetingDto;
}

export function decodeMeetingTopicBody(body: Buffer): MeetingTopicDto {
  const value = decodeCanonicalArray(body, 1_100_000);
  if (value.length !== 13
    || !isUuid(value[0])
    || !isUuid(value[1])
    || !isUuid(value[2])
    || !isUuid(value[3])
    || !(value[4] instanceof Uint8Array)
    || ![null, "manual", "recurrence"].includes(value[5] as null | string)
    || typeof value[6] !== "boolean"
    || !isNullablePositiveInteger(value[7])
    || typeof value[8] !== "boolean"
    || !isNullablePositiveInteger(value[9])
    || typeof value[10] !== "boolean"
    || !isNullableUuid(value[11])
    || typeof value[12] !== "boolean") {
    invalid();
  }
  return {
    id: value[0],
    mutationId: value[1],
    topicId: value[2],
    sectionId: value[3],
    initialUpdateEnvelope: Buffer.from(value[4]).toString("base64url"),
    ...(value[6] ? { source: value[5] } : {}),
    ...(value[8] ? { position: value[7] } : {}),
    ...(value[10] ? { plannedDuration: value[9] } : {}),
    ...(value[12] ? { sourceAppearanceId: value[11] } : {}),
  } as MeetingTopicDto;
}

function decodeCanonicalArray(body: Buffer, limit: number): unknown[] {
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > limit) invalid();
  let value: unknown;
  try {
    value = decoder.decode(body);
  } catch {
    invalid();
  }
  if (!Array.isArray(value) || !Buffer.from(encoder.encode(value)).equals(body)) invalid();
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1);
}

function invalid(): never {
  throw new BadRequestException({
    code: "E2EE_BINARY_BODY_INVALID",
    message: "A canonical binary Meeting create body is required",
  });
}
