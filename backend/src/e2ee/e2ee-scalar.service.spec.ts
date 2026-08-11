import { E2eeClientEpoch } from "./e2ee-client-epoch.entity";
import { E2eeKeyState } from "./e2ee-key-state.entity";
import { E2eeScalarWrite } from "./e2ee-scalar-write.entity";
import { E2eeScalarService } from "./e2ee-scalar.service";
import * as validator from "./scalar-envelope-validator";

jest.mock("./scalar-envelope-validator");

describe("E2eeScalarService", () => {
  const epochId = "00000000-0000-4000-8000-000000000003";
  const recordId = "00000000-0000-4000-8000-000000000004";
  const envelope = Buffer.alloc(256, 7);
  const fingerprint = Buffer.alloc(32, 8);
  const user = { id: "user", role: "user" } as any;
  const state = {
    organizationId: "00000000-0000-4000-8000-000000000001",
    ockId: "00000000-0000-4000-8000-000000000002",
  };
  const epoch = {
    id: epochId,
    userId: "user",
    revokedAt: null,
    noncePrefix: Buffer.alloc(16),
    signingPublicKey: Buffer.alloc(32),
  };
  const context = { aggregateType: 256, recordId, fieldId: 1 } as const;
  const encoded = envelope.toString("base64url");
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (_entity, value) => value),
  };
  let service: E2eeScalarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new E2eeScalarService();
    jest.mocked(validator.scalarEnvelopeClientEpochId).mockReturnValue(epochId);
    jest.mocked(validator.validateScalarEnvelope).mockReturnValue({
      clientEpochId: epochId,
      writeCounter: 9,
      ciphertextLength: 256,
      fingerprint,
    });
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === E2eeKeyState) return state;
      if (entity === E2eeClientEpoch) return epoch;
      return null;
    });
  });

  it("records the public replay identity and increments the server revision", async () => {
    await expect(service.validateWrite(manager as any, user, context, encoded, "4"))
      .resolves.toEqual({ envelope, commitRevision: "5", duplicate: false });

    expect(manager.save).toHaveBeenCalledWith(E2eeScalarWrite, expect.objectContaining({
      writeCounter: "9",
      aggregateType: 256,
      envelopeFingerprint: fingerprint,
      commitRevision: "5",
    }));
  });

  it("accepts an exact retry without advancing the server revision", async () => {
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === E2eeKeyState) return state;
      if (entity === E2eeClientEpoch) return epoch;
      return { envelopeFingerprint: fingerprint, commitRevision: "12" };
    });

    await expect(service.validateWrite(manager as any, user, context, encoded, "12"))
      .resolves.toEqual({ envelope, commitRevision: "12", duplicate: true });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("rejects counter reuse with different envelope bytes", async () => {
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === E2eeKeyState) return state;
      if (entity === E2eeClientEpoch) return epoch;
      return { envelopeFingerprint: Buffer.alloc(32, 9), commitRevision: "12" };
    });

    await expect(service.validateWrite(manager as any, user, context, encoded, "12"))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "E2EE_COUNTER_REUSE" }) });
  });

  it("rejects a revoked, foreign, or non-content author before validation", async () => {
    await expect(service.validateWrite(
      manager as any,
      { id: "guest", role: "guest" } as any,
      context,
      encoded,
      null,
    )).rejects.toThrow("cannot access Protected ciphertext");
    await expect(service.validateWrite(
      manager as any,
      { id: "guest", role: "guest" } as any,
      context,
      encoded,
      null,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN" }),
    });

    manager.findOne.mockImplementation(async (entity) => entity === E2eeKeyState
      ? state
      : entity === E2eeClientEpoch
        ? { ...epoch, userId: "other" }
        : null);
    await expect(service.validateWrite(manager as any, user, context, encoded, null))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "E2EE_CLIENT_EPOCH_INVALID" }) });
  });
});
