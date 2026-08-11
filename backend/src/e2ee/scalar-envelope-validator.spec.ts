import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { validateScalarEnvelope } from "./scalar-envelope-validator";

const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const uuid = (value: string) => Buffer.from(value.replaceAll("-", ""), "hex");

describe("validateScalarEnvelope", () => {
  beforeAll(async () => sodium.ready);

  it("accepts a signed, context-bound scalar and rejects corruption or transplant", () => {
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const recordId = "00000000-0000-4000-8000-000000000007";
    const ockId = "00000000-0000-4000-8000-000000000004";
    const clientEpochId = "00000000-0000-4000-8000-000000000008";
    const noncePrefix = Buffer.from("c0c1c2c3c4c5c6c7c8c9cacbcccdcecf", "hex");
    const nonce = Buffer.concat([noncePrefix, Buffer.from("0000000000000001", "hex")]);
    const header = [
      uuid(organizationId),
      256,
      uuid(recordId),
      1,
      uuid(ockId),
      uuid(clientEpochId),
      1,
      nonce,
    ];
    const ciphertext = Buffer.alloc(272, 31);
    const signed = Buffer.concat([
      Buffer.from("ElderFlow signed envelope v1\0"),
      Buffer.from(encoder.encode([1, 4, 1, header, ciphertext])),
    ]);
    const signing = sodium.crypto_sign_seed_keypair(Buffer.alloc(32, 17), "uint8array");
    const envelope = Buffer.from(encoder.encode([
      1,
      4,
      1,
      header,
      ciphertext,
      sodium.crypto_sign_detached(signed, signing.privateKey, "uint8array"),
    ]));
    const expected = {
      organizationId,
      aggregateType: 256,
      recordId,
      fieldId: 1,
      ockId,
      clientEpochId,
      noncePrefix,
      signingPublicKey: Buffer.from(signing.publicKey),
    } as const;

    expect(validateScalarEnvelope(envelope, expected)).toMatchObject({
      clientEpochId,
      writeCounter: 1,
      ciphertextLength: 272,
    });

    const corrupted = Buffer.from(envelope);
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => validateScalarEnvelope(corrupted, expected)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: "E2EE_ENVELOPE_INVALID" }) }),
    );
    expect(() => validateScalarEnvelope(envelope, {
      ...expected,
      recordId: "00000000-0000-4000-8000-000000000009",
    })).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: "E2EE_ENVELOPE_CONTEXT_INVALID" }) }),
    );
  });
});
