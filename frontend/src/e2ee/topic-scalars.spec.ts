import { describe, expect, it } from "vitest";
import type { TopicInput } from "../api/domain";
import {
  protectTopicInput,
  unprotectTopic,
  unprotectTopicSnapshot,
  type EncryptedTopicResponse,
  type ScalarCryptor,
} from "./topic-scalars";

const cryptor: ScalarCryptor = {
  isUnlocked: () => true,
  encrypt: async (context, value) => new TextEncoder().encode(`${context.fieldId}:${value ?? "<null>"}`),
  decrypt: async (_context, envelope) => new TextDecoder().decode(envelope).replace(/^\d:/, "").replace("<null>", "") || null,
};

describe("Topic Protected-text projection", () => {
  it("removes plaintext from a create request and restores it only in memory", async () => {
    const input = {
      name: "Pastoral care",
      description: "<p>Private context</p>",
      type: "new_membership",
      status: "open",
      followUpDate: null,
      responsibleUserId: null,
      defaultSectionId: null,
      defaultPosition: null,
      membershipProcessStatus: "First visit",
      membershipStatusSignal: "in_progress",
      godparents: "Ada and Grace",
    } satisfies TopicInput;

    const protectedRequest = await protectTopicInput(
      "00000000-0000-4000-8000-000000000010",
      input,
      cryptor,
    );

    expect(JSON.stringify(protectedRequest)).not.toContain("Pastoral care");
    expect(JSON.stringify(protectedRequest)).not.toContain("Private context");
    expect(protectedRequest.protected).toEqual({
      nameEnvelope: "MTpQYXN0b3JhbCBjYXJl",
      descriptionEnvelope: "Mjo8cD5Qcml2YXRlIGNvbnRleHQ8L3A-",
      membershipProcessStatusEnvelope: "MzpGaXJzdCB2aXNpdA",
      godparentsEnvelope: "NDpBZGEgYW5kIEdyYWNl",
    });

    const response = {
      ...protectedRequest,
      createdAt: "2026-08-10T12:00:00Z",
      updatedAt: "2026-08-10T12:00:00Z",
      protected: {
        ...protectedRequest.protected,
        nameCommitRevision: "1",
        descriptionCommitRevision: "1",
        membershipProcessStatusCommitRevision: "1",
        godparentsCommitRevision: "1",
      },
    } as EncryptedTopicResponse;
    await expect(unprotectTopic(response, cryptor)).resolves.toMatchObject(input);
  });

  it("decrypts immutable appearance snapshots with the owning Topic context", async () => {
    const observed: Array<{ aggregateType: number; recordId: string; fieldId: number }> = [];
    const snapshotCryptor: ScalarCryptor = {
      ...cryptor,
      decrypt: async (context, envelope) => {
        observed.push(context);
        return cryptor.decrypt(context, envelope);
      },
    };

    await expect(unprotectTopicSnapshot(
      "00000000-0000-4000-8000-000000000010",
      {
        nameEnvelope: "MTpSZWNvcmRlZCBuYW1l",
        nameCommitRevision: "4",
        membershipProcessStatusEnvelope: "MzpSZWNvcmRlZCBwcm9jZXNz",
        membershipProcessStatusCommitRevision: "5",
        godparentsEnvelope: "NDpSZWNvcmRlZCBnb2RwYXJlbnRz",
        godparentsCommitRevision: "6",
      },
      snapshotCryptor,
    )).resolves.toEqual({
      name: "Recorded name",
      membershipProcessStatus: "Recorded process",
      godparents: "Recorded godparents",
    });
    expect(observed.map(({ fieldId }) => fieldId)).toEqual([1, 3, 4]);
    expect(observed.every(({ recordId }) => recordId.endsWith("0010"))).toBe(true);
  });

  it("uses locked and unavailable placeholders without retaining ciphertext in the view model", async () => {
    const locked = { ...cryptor, isUnlocked: () => false };
    const response = {
      id: "00000000-0000-4000-8000-000000000010",
      type: "generic",
      status: "open",
      protected: {
        nameEnvelope: "AQ",
        descriptionEnvelope: "Ag",
        membershipProcessStatusEnvelope: "Aw",
        godparentsEnvelope: "BA",
      },
    } as EncryptedTopicResponse;

    await expect(unprotectTopic(response, locked)).resolves.toMatchObject({
      name: "Unlock Protected text to view this content.",
      description: "Unlock Protected text to view this content.",
    });
    await expect(unprotectTopic({ ...response, protected: null }, locked)).resolves.toMatchObject({
      name: "Protected text is unavailable.",
    });
  });
});
