// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import sodium from "libsodium-wrappers-sumo";
import { encryptScalar, decryptScalar } from "../e2ee/scalar-codec";
import { SCALAR_AGGREGATES } from "../e2ee/scalar-registry";

beforeAll(async () => { await sodium.ready; });
it("encrypts complete contexts and binds them to the immutable mention record", async () => {
  const signing = sodium.crypto_sign_keypair();
  const context = {
    organizationId: "00000000-0000-4000-8000-000000000001",
    ockId: "00000000-0000-4000-8000-000000000002",
    recordId: "00000000-0000-4000-8000-000000000003",
    aggregateType: SCALAR_AGGREGATES.mention, fieldId: 1 as const,
  };
  const contentKey = new Uint8Array(32).fill(6);
  const value = JSON.stringify({ meetingId: "meeting", appearanceId: "appearance", context: "Before @Daniel talks with Dr. X." });
  const envelope = await encryptScalar({ ...context,
    contentKey, clientEpochId: "00000000-0000-4000-8000-000000000004",
    noncePrefix: new Uint8Array(16).fill(9), signingPrivateKey: signing.privateKey, writeCounter: 1, value,
  });
  expect(new TextDecoder().decode(envelope)).not.toContain("Daniel");
  await expect(decryptScalar({ ...context, contentKey, envelope, signingPublicKey: signing.publicKey })).resolves.toBe(value);
  await expect(decryptScalar({ ...context, recordId: "00000000-0000-4000-8000-000000000005", contentKey, envelope })).rejects.toThrow();
  envelope[envelope.length - 1] ^= 1;
  await expect(decryptScalar({ ...context, contentKey, envelope, signingPublicKey: signing.publicKey })).rejects.toThrow();
});
