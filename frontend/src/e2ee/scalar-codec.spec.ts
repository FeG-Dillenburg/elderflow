// @vitest-environment node
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Decoder, Encoder } from "cbor-x";
import {
  decryptScalar,
  encryptScalar,
  type ScalarContext,
} from "./scalar-codec";

const context: ScalarContext = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  aggregateType: 256,
  recordId: "00000000-0000-4000-8000-000000000002",
  fieldId: 1,
  ockId: "00000000-0000-4000-8000-000000000003",
};

describe("encrypted scalar codec", () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  it("reproduces the pinned cross-runtime signed-null vector", async () => {
    const vectors = JSON.parse(readFileSync(
      resolve(process.cwd(), "../docs/security/e2ee-v1-key-vectors.json"),
      "utf8",
    ));
    const vector = vectors.signedNullScalar;
    const fromHex = (value: string) => Uint8Array.from(Buffer.from(value, "hex"));
    const signing = sodium.crypto_sign_seed_keypair(fromHex(vector.signingSeedHex), "uint8array");
    const envelope = await encryptScalar({
      organizationId: vector.organizationId,
      aggregateType: vector.aggregateType,
      recordId: vector.recordId,
      fieldId: vector.fieldId,
      ockId: vector.ockId,
      clientEpochId: vector.clientEpochId,
      writeCounter: Number(vector.writeCounter),
      noncePrefix: fromHex(vector.noncePrefixHex),
      contentKey: fromHex(vector.organizationContentKeyHex),
      signingPrivateKey: signing.privateKey,
      value: null,
      randomBytes: (length) => new Uint8Array(length).fill(
        Number.parseInt(vector.paddingByteHex, 16),
      ),
    });

    expect(createHash("sha256").update(envelope).digest("hex"))
      .toBe(vector.envelopeSha256Hex);
  });

  it("round-trips null and empty as indistinguishable padded envelope sizes", async () => {
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const common = {
      ...context,
      clientEpochId: "00000000-0000-4000-8000-000000000004",
      noncePrefix: new Uint8Array(16).fill(9),
      contentKey: new Uint8Array(32).fill(11),
      signingPrivateKey: signing.privateKey,
      randomBytes: (length: number) => new Uint8Array(length).fill(13),
    };

    const nullEnvelope = await encryptScalar({ ...common, writeCounter: 1, value: null });
    const emptyEnvelope = await encryptScalar({ ...common, writeCounter: 2, value: "" });

    expect(nullEnvelope).toHaveLength(emptyEnvelope.length);
    await expect(decryptScalar({
      ...context,
      envelope: nullEnvelope,
      contentKey: common.contentKey,
    })).resolves.toBeNull();
    await expect(decryptScalar({
      ...context,
      envelope: emptyEnvelope,
      contentKey: common.contentKey,
    })).resolves.toBe("");
  });

  it("fails closed for corruption, transplant, and an unknown envelope version", async () => {
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(17), "uint8array");
    const envelope = await encryptScalar({
      ...context,
      clientEpochId: "00000000-0000-4000-8000-000000000004",
      writeCounter: 1,
      noncePrefix: new Uint8Array(16).fill(19),
      contentKey: new Uint8Array(32).fill(23),
      signingPrivateKey: signing.privateKey,
      value: "private marker",
      randomBytes: (length) => new Uint8Array(length).fill(29),
    });

    const corrupted = Uint8Array.from(envelope);
    corrupted[Math.floor(corrupted.length / 2)] ^= 1;
    await expect(decryptScalar({
      ...context,
      envelope: corrupted,
      contentKey: new Uint8Array(32).fill(23),
    })).rejects.toThrow("E2EE_SCALAR_INVALID");
    await expect(decryptScalar({
      ...context,
      recordId: "00000000-0000-4000-8000-000000000005",
      envelope,
      contentKey: new Uint8Array(32).fill(23),
    })).rejects.toThrow("E2EE_SCALAR_CONTEXT_INVALID");

    const decoded = new Decoder({ mapsAsObjects: false, useRecords: false }).decode(envelope);
    decoded[0] = 2;
    const unknownVersion = Uint8Array.from(new Encoder({
      mapsAsObjects: false,
      structuredClone: false,
      tagUint8Array: false,
      useRecords: false,
    }).encode(decoded));
    await expect(decryptScalar({
      ...context,
      envelope: unknownVersion,
      contentKey: new Uint8Array(32).fill(23),
    })).rejects.toThrow("E2EE_SCALAR_INVALID");
  });
});
