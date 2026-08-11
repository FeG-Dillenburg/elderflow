import { Encoder } from "cbor-x";
import { decodeMeetingCreateBody, decodeMeetingTopicBody } from "./meeting-create-binary";

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});

describe("binary Meeting create body", () => {
  it("keeps snapshot and title envelopes binary at the HTTP boundary", () => {
    const body = Buffer.from(encoder.encode([
      "00000000-0000-4000-8000-000000000001",
      Uint8Array.from([1, 2]),
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      Uint8Array.from([3, 4]),
      "2026-08-20",
      "19:00",
      "planned",
      null,
      null,
    ]));

    expect(decodeMeetingCreateBody(body)).toMatchObject({
      protected: { titleEnvelope: "AQI" },
      document: { snapshotEnvelope: "AwQ" },
    });
  });

  it("rejects malformed or non-canonical bodies", () => {
    expect(() => decodeMeetingCreateBody(Buffer.from([0xff])))
      .toThrow("A canonical binary Meeting create body is required");
  });

  it("decodes atomic structure and the initial document update from canonical CBOR", () => {
    const body = Buffer.from(encoder.encode([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      Uint8Array.from([5, 6]),
      "recurrence",
      true,
      2,
      true,
      null,
      false,
      null,
      false,
    ]));

    expect(decodeMeetingTopicBody(body)).toMatchObject({
      source: "recurrence",
      position: 2,
      initialUpdateEnvelope: "BQY",
    });
  });
});
