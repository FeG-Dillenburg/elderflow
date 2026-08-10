// @vitest-environment node
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import { ScalarSession } from "./scalar-session";

describe("ScalarSession", () => {
  beforeAll(async () => sodium.ready);

  it("keeps keys and counters volatile and refuses work after lock", async () => {
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(5), "uint8array");
    const session = new ScalarSession();
    session.unlock({
      organizationId: "00000000-0000-4000-8000-000000000001",
      ockId: "00000000-0000-4000-8000-000000000002",
      clientEpochId: "00000000-0000-4000-8000-000000000003",
      noncePrefix: new Uint8Array(16).fill(7),
      contentKey: new Uint8Array(32).fill(11),
      signingPrivateKey: signing.privateKey,
    });
    const context = {
      aggregateType: 256,
      recordId: "00000000-0000-4000-8000-000000000004",
      fieldId: 1,
    } as const;

    const first = await session.encrypt(context, "one");
    const second = await session.encrypt(context, "two");
    await expect(session.decrypt(context, first)).resolves.toBe("one");
    await expect(session.decrypt(context, second)).resolves.toBe("two");

    session.lock();
    expect(session.isUnlocked()).toBe(false);
    await expect(session.decrypt(context, first)).rejects.toThrow("E2EE_PROTECTED_TEXT_LOCKED");
  });
});
