// @vitest-environment jsdom
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptScalar, encryptScalar } from "./scalar-codec";

describe("encrypted scalar codec in a browser runtime", () => {
  beforeAll(async () => sodium.ready);

  it("round-trips non-empty UTF-8 bytes decoded by the browser CBOR runtime", async () => {
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const context = {
      organizationId: "00000000-0000-4000-8000-000000000001",
      aggregateType: 256,
      recordId: "00000000-0000-4000-8000-000000000002",
      fieldId: 1,
      ockId: "00000000-0000-4000-8000-000000000003",
    } as const;
    const envelope = await encryptScalar({
      ...context,
      clientEpochId: "00000000-0000-4000-8000-000000000004",
      writeCounter: 1,
      noncePrefix: new Uint8Array(16).fill(9),
      contentKey: new Uint8Array(32).fill(11),
      signingPrivateKey: signing.privateKey,
      value: "Browser marker äöü",
      randomBytes: (length) => new Uint8Array(length).fill(13),
    });

    await expect(decryptScalar({
      ...context,
      envelope: Uint8Array.from(envelope),
      contentKey: new Uint8Array(32).fill(11),
    })).resolves.toBe("Browser marker äöü");
  });
});
