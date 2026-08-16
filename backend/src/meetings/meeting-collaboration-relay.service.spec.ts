import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { WebSocket } from "ws";
import { E2eeClientEpoch } from "../e2ee/e2ee-client-epoch.entity";
import { E2eeKeyState } from "../e2ee/e2ee-key-state.entity";
import { User } from "../users/user.entity";
import { MeetingCollaborationRelayService } from "./meeting-collaboration-relay.service";
import { Meeting } from "./meeting.entity";

interface FakeSocket {
  collaboration: {
    meetingId: string;
    documentId: string;
    user: { id: string; role: string; sessionVersion: number; archivedAt: null };
  };
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
}

describe("MeetingCollaborationRelayService", () => {
  const encode = (value: unknown): Buffer => Buffer.from(new Encoder({
    mapsAsObjects: false,
    structuredClone: false,
    tagUint8Array: false,
    useRecords: false,
  }).encode(value));
  const uuid = (value: string): Buffer => Buffer.from(value.replaceAll("-", ""), "hex");
  const user = { id: "user", role: "admin", sessionVersion: 1, archivedAt: null };
  const repositories = new Map<unknown, { findOneBy: jest.Mock; findOneByOrFail: jest.Mock }>();
  const dataSource = {
    getRepository: jest.fn((entity) => repositories.get(entity)),
  };
  const meetings = {
    appendWorkspaceUpdate: jest.fn(),
  };
  const service = new MeetingCollaborationRelayService(
    { httpAdapter: {} } as never,
    {} as never,
    meetings as never,
    dataSource as never,
  );

  const socket = (): FakeSocket => ({
    collaboration: { meetingId: "meeting", documentId: "document", user: { ...user } },
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
  });

  const invokeMessage = async (client: FakeSocket, frame: object | string): Promise<void> => {
    const encoded = typeof frame === "string" ? frame : JSON.stringify(frame);
    await (service as unknown as {
      message: (socket: FakeSocket, data: Buffer, binary: boolean) => Promise<void>;
    }).message(client, Buffer.from(encoded), false);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repositories.clear();
    repositories.set(User, {
      findOneBy: jest.fn().mockResolvedValue({ ...user }),
      findOneByOrFail: jest.fn(),
    });
    repositories.set(Meeting, {
      findOneBy: jest.fn().mockResolvedValue({ id: "meeting", status: "planned" }),
      findOneByOrFail: jest.fn(),
    });
    repositories.set(E2eeClientEpoch, {
      findOneBy: jest.fn(),
      findOneByOrFail: jest.fn().mockResolvedValue({ signingPublicKey: Buffer.alloc(32, 4) }),
    });
    meetings.appendWorkspaceUpdate.mockResolvedValue({
      updateId: "update",
      clientEpochId: "epoch",
      authorClock: "1",
      serverSequence: "1",
    });
    (service as unknown as { rooms: Map<string, Set<FakeSocket>> }).rooms.clear();
  });

  it("acknowledges an accepted opaque update and broadcasts it to another client", async () => {
    const sender = socket();
    const peer = socket();
    (service as unknown as { rooms: Map<string, Set<FakeSocket>> }).rooms.set(
      "document",
      new Set([sender, peer]),
    );
    const envelope = Buffer.from("ciphertext").toString("base64url");

    await invokeMessage(sender, { type: "update", envelope });

    expect(meetings.appendWorkspaceUpdate).toHaveBeenCalledWith(
      "meeting",
      envelope,
      expect.objectContaining({ id: "user" }),
      undefined,
    );
    expect(sender.send).toHaveBeenCalledWith(expect.stringContaining('"type":"acknowledged"'));
    expect(peer.send).toHaveBeenCalledWith(expect.stringContaining('"type":"update"'));
  });

  it("rejects oversized frames before persistence", async () => {
    const client = socket();

    await invokeMessage(client, "x".repeat(1_500_001));

    expect(meetings.appendWorkspaceUpdate).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({
      type: "rejected",
      code: "E2EE_COLLABORATION_FRAME_INVALID",
    }));
  });

  it.each([
    ["authorization revocation", null, { id: "meeting", status: "planned" }, "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN"],
    ["Meeting completion", user, { id: "meeting", status: "completed" }, "MEETING_COMPLETED_IMMUTABLE"],
  ])("rejects a late write after %s", async (_label, activeUser, activeMeeting, code) => {
    repositories.get(User)?.findOneBy.mockResolvedValue(activeUser);
    repositories.get(Meeting)?.findOneBy.mockResolvedValue(activeMeeting);
    const client = socket();

    await invokeMessage(client, {
      type: "update",
      envelope: Buffer.from("ciphertext").toString("base64url"),
    });

    expect(meetings.appendWorkspaceUpdate).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: "rejected", code }));
    expect(client.close).toHaveBeenCalledWith(4403, code);
  });

  it("fans compaction and completion state changes out to every Meeting client", () => {
    jest.useFakeTimers();
    const first = socket();
    const second = socket();
    (service as unknown as { rooms: Map<string, Set<FakeSocket>> }).rooms.set(
      "document",
      new Set([first, second]),
    );
    const relay = service as unknown as {
      meetingCompacted: (event: { meetingId: string }) => void;
      meetingCompleted: (event: { meetingId: string }) => void;
    };

    relay.meetingCompacted({ meetingId: "meeting" });
    expect(first.send).toHaveBeenCalledWith(JSON.stringify({ type: "parent-changed" }));
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ type: "parent-changed" }));

    relay.meetingCompleted({ meetingId: "meeting" });
    jest.advanceTimersByTime(250);
    for (const client of [first, second]) {
      expect(client.send).toHaveBeenCalledWith(JSON.stringify({
        type: "rejected",
        code: "MEETING_COMPLETED_IMMUTABLE",
      }));
      expect(client.close).toHaveBeenCalledWith(4403, "MEETING_COMPLETED_IMMUTABLE");
    }
    jest.useRealTimers();
  });

  it("rejects replayed encrypted awareness clocks", async () => {
    await sodium.ready;
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const documentId = "00000000-0000-4000-8000-000000000002";
    const ockId = "00000000-0000-4000-8000-000000000003";
    const clientEpochId = "00000000-0000-4000-8000-000000000004";
    const userId = "00000000-0000-4000-8000-000000000005";
    const noncePrefix = Buffer.alloc(16, 8);
    const signing = sodium.crypto_sign_keypair("uint8array");
    const header = [
      uuid(organizationId),
      uuid(documentId),
      uuid(ockId),
      1,
      uuid(clientEpochId),
      1,
      Buffer.concat([noncePrefix, Buffer.from("0000000000000001", "hex")]),
    ];
    const ciphertext = Buffer.alloc(17, 9);
    const signature = sodium.crypto_sign_detached(
      Buffer.concat([
        Buffer.from("ElderFlow signed envelope v1\0"),
        encode([1, 7, 1, header, ciphertext]),
      ]),
      signing.privateKey,
    );
    const envelope = encode([1, 7, 1, header, ciphertext, signature]).toString("base64url");
    repositories.set(E2eeKeyState, {
      findOneBy: jest.fn().mockResolvedValue({ organizationId, ockId }),
      findOneByOrFail: jest.fn(),
    });
    repositories.set(E2eeClientEpoch, {
      findOneBy: jest.fn().mockResolvedValue({
        id: clientEpochId,
        organizationId,
        userId,
        noncePrefix,
        signingPublicKey: Buffer.from(signing.publicKey),
        revokedAt: null,
      }),
      findOneByOrFail: jest.fn(),
    });
    const validate = service as unknown as {
      validateAwareness: (connection: object, encoded: string) => Promise<object>;
    };
    const connection = { documentId, user: { id: userId } };

    await expect(validate.validateAwareness(connection, envelope)).resolves.toMatchObject({
      clientEpochId,
      awarenessClock: "1",
    });
    await expect(validate.validateAwareness(connection, envelope)).rejects.toThrow(
      "E2EE_AWARENESS_REPLAY",
    );
  });
});
