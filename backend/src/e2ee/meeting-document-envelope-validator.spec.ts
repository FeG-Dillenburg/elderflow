import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateMeetingSnapshotEnvelope,
  validateMeetingUpdateEnvelope,
} from "./meeting-document-envelope-validator";

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const uuid = (value: string): Buffer => Buffer.from(value.replaceAll("-", ""), "hex");
const encode = (value: unknown): Buffer => Buffer.from(encoder.encode(value));

describe("Meeting document envelope validator", () => {
  const organizationId = "00000000-0000-4000-8000-000000000001";
  const documentId = "00000000-0000-4000-8000-000000000002";
  const activeSnapshotId = "00000000-0000-4000-8000-000000000003";
  const ockId = "00000000-0000-4000-8000-000000000004";
  const clientEpochId = "00000000-0000-4000-8000-000000000005";

  beforeAll(async () => sodium.ready);

  it("consumes the same frozen update and snapshot bytes as the browser codec", () => {
    const vectors = JSON.parse(readFileSync(resolve(
      __dirname,
      "../../../docs/security/fixtures/meeting-document-vectors.json",
    ), "utf8")) as Record<string, string>;
    const expected = {
      organizationId: vectors.organizationId,
      documentId: vectors.documentId,
      ockId: vectors.ockId,
      clientEpochId: vectors.clientEpochId,
      noncePrefix: Buffer.from(vectors.noncePrefix, "base64url"),
    };

    expect(validateMeetingUpdateEnvelope(Buffer.from(vectors.updateEnvelope, "base64url"), {
      ...expected,
      activeSnapshotId: vectors.snapshotId,
      signingPublicKey: Buffer.from(vectors.updatePublicKey, "base64url"),
    })).toMatchObject({ authorClock: 1, clientEpochId: vectors.clientEpochId });
    expect(validateMeetingSnapshotEnvelope(Buffer.from(vectors.snapshotEnvelope, "base64url"), {
      ...expected,
      snapshotId: vectors.snapshotId,
      signingPublicKey: Buffer.from(vectors.snapshotPublicKey, "base64url"),
    })).toMatchObject({ snapshotClock: 1, clientEpochId: vectors.clientEpochId });
  });

  it("validates public update metadata and signature without opening ciphertext", () => {
    const signing = sodium.crypto_sign_keypair("uint8array");
    const noncePrefix = Buffer.alloc(16, 7);
    const nonce = Buffer.concat([noncePrefix, Buffer.from("0000000000000001", "hex")]);
    const header = [
      uuid(organizationId),
      uuid(documentId),
      uuid(activeSnapshotId),
      uuid(ockId),
      2,
      uuid(clientEpochId),
      1,
      nonce,
    ];
    const ciphertext = Buffer.alloc(64, 9);
    const signature = sodium.crypto_sign_detached(
      Buffer.concat([
        Buffer.from("ElderFlow signed envelope v1\0"),
        encode([1, 5, 1, header, ciphertext]),
      ]),
      signing.privateKey,
    );
    const envelope = encode([1, 5, 1, header, ciphertext, signature]);

    expect(validateMeetingUpdateEnvelope(envelope, {
      organizationId,
      documentId,
      activeSnapshotId,
      ockId,
      clientEpochId,
      noncePrefix,
      signingPublicKey: Buffer.from(signing.publicKey),
    })).toMatchObject({
      authorClock: 1,
      clientEpochId,
      ciphertextLength: 64,
    });

    expect(() => validateMeetingUpdateEnvelope(envelope, {
      organizationId,
      documentId: "00000000-0000-4000-8000-000000000099",
      activeSnapshotId,
      ockId,
      clientEpochId,
      noncePrefix,
      signingPublicKey: Buffer.from(signing.publicKey),
    })).toThrow(expect.objectContaining({
      response: expect.objectContaining({ code: "E2EE_ENVELOPE_CONTEXT_INVALID" }),
    }));
  });
});
