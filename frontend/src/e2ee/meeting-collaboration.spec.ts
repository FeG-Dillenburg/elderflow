// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Decoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import * as Y from "yjs";
import { api } from "../api/domain";
import {
  MeetingDocumentSession,
  meetingDocumentSession,
} from "./meeting-document-session";
import {
  meetingFragmentId,
  replaceMeetingFragment,
} from "./meeting-document-codec";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";
import {
  EncryptedMeetingCollaborationProvider,
  MEETING_COLLABORATION_ORIGIN,
} from "./meeting-collaboration";

class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  readonly sent: string[] = [];

  send(value: string): void {
    this.sent.push(value);
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(frame: object): void {
    this.dispatchEvent(new MessageEvent("message", {
      data: JSON.stringify(frame),
    }));
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
};

describe("EncryptedMeetingCollaborationProvider", () => {
  afterEach(() => {
    meetingDocumentSession.lock();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends only one encrypted update at a time and advances after acknowledgement", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockResolvedValueOnce({ envelope: "envelope-1", activeSnapshotId: "snapshot", authorClock: 1 })
      .mockResolvedValueOnce({ envelope: "envelope-2", activeSnapshotId: "snapshot", authorClock: 2 });
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    vi.spyOn(meetingDocumentSession, "acknowledge").mockImplementation(() => undefined);
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      async () => ({ parentChanged: false }),
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    document.getText("field").insert(0, "a");
    document.getText("field").insert(1, "b");
    await settle();
    const updates = () => socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "update");
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(updates()).toEqual([{ type: "update", envelope: "envelope-1" }]);

    socket.receive({
      type: "acknowledged",
      envelope: "envelope-1",
      clientEpochId: "epoch",
      authorClock: "1",
      serverSequence: "1",
    });
    await settle();
    expect(updates()).toEqual([
      { type: "update", envelope: "envelope-1" },
      { type: "update", envelope: "envelope-2" },
    ]);

    provider.destroy();
    document.destroy();
  });

  it("is not ready for Meeting completion until queued updates are acknowledged", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    let finishEncryption!: (pending: {
      envelope: string;
      activeSnapshotId: string;
      authorClock: number;
    }) => void;
    vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockReturnValue(new Promise((resolve) => {
        finishEncryption = resolve;
      }));
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    vi.spyOn(meetingDocumentSession, "acknowledge").mockImplementation(() => undefined);
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    document.getText("field").insert(0, "not yet saved");
    const readiness = (provider as unknown as {
      readyForCompletion: () => Promise<boolean>;
    }).readyForCompletion();
    finishEncryption({
      envelope: "pending-envelope",
      activeSnapshotId: "snapshot",
      authorClock: 1,
    });

    await expect(readiness).resolves.toBe(false);
    socket.receive({
      type: "acknowledged",
      envelope: "pending-envelope",
      clientEpochId: "epoch",
      authorClock: "1",
      serverSequence: "1",
    });
    await settle();
    await expect((provider as unknown as {
      readyForCompletion: () => Promise<boolean>;
    }).readyForCompletion()).resolves.toBe(true);

    provider.destroy();
    document.destroy();
  });

  it("finishes automatic compaction before encrypting the next local edit", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockResolvedValueOnce({
        envelope: "before-compaction",
        activeSnapshotId: "old-snapshot",
        authorClock: 100,
      })
      .mockResolvedValueOnce({
        envelope: "after-compaction",
        activeSnapshotId: "new-snapshot",
        authorClock: 101,
      });
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    vi.spyOn(meetingDocumentSession, "acknowledge").mockImplementation(() => undefined);
    let finishCompaction!: () => void;
    let markCompactionStarted!: () => void;
    const compactionStarted = new Promise<void>((resolve) => {
      markCompactionStarted = resolve;
    });
    const compaction = new Promise<void>((resolve) => {
      finishCompaction = resolve;
    });
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      async () => {
        markCompactionStarted();
        await compaction;
      },
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    document.getText("field").insert(0, "a");
    await settle();
    socket.receive({
      type: "acknowledged",
      envelope: "before-compaction",
      clientEpochId: "epoch",
      authorClock: "100",
      serverSequence: "100",
    });
    await compactionStarted;
    document.getText("field").insert(1, "b");
    await settle();

    expect(encrypt).toHaveBeenCalledTimes(1);
    finishCompaction();
    await settle();
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(socket.sent.map((value) => JSON.parse(value)))
      .toContainEqual({ type: "update", envelope: "after-compaction" });

    provider.destroy();
    document.destroy();
  });

  it("reseals each pending delta after compaction instead of encoding the whole document", async () => {
    const document = new Y.Doc();
    document.getText("large-existing-field").insert(0, "x".repeat(1_100_000));
    const socket = new FakeSocket();
    const originalUpdates: Uint8Array[] = [];
    const resealedUpdates: Uint8Array[] = [];
    let encryptionCall = 0;
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockImplementation(async (_meetingId, update) => {
        encryptionCall += 1;
        const target = encryptionCall <= 2 ? originalUpdates : resealedUpdates;
        target.push(Uint8Array.from(update));
        return {
          envelope: `${encryptionCall <= 2 ? "old" : "new"}-envelope-${(encryptionCall - 1) % 2 + 1}`,
          activeSnapshotId: encryptionCall <= 2 ? "old-snapshot" : "new-snapshot",
          authorClock: encryptionCall,
        };
      });
    vi.spyOn(meetingDocumentSession, "decryptPendingDocumentUpdate")
      .mockImplementation(async (_meetingId, pending) => Uint8Array.from(
        pending.envelope.endsWith("1") ? originalUpdates[0] : originalUpdates[1],
      ));
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      async () => ({ parentChanged: true }),
    );
    await provider.connect();
    socket.open();

    document.getText("field").insert(0, "a");
    document.getText("field").insert(1, "b");
    await settle();
    socket.receive({ type: "authenticated" });
    await settle();

    expect(encrypt).toHaveBeenCalledTimes(4);
    expect(resealedUpdates).toEqual(originalUpdates);
    const updateFrames = socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "update");
    expect(updateFrames).toEqual([{ type: "update", envelope: "new-envelope-1" }]);

    provider.destroy();
    document.destroy();
  });

  it("reseals a pending edit after the server rejects its stale snapshot context", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockResolvedValueOnce({
        envelope: "old-snapshot-envelope",
        activeSnapshotId: "old-snapshot",
        authorClock: 1,
      })
      .mockResolvedValueOnce({
        envelope: "current-snapshot-envelope",
        activeSnapshotId: "current-snapshot",
        authorClock: 2,
      });
    vi.spyOn(meetingDocumentSession, "decryptPendingDocumentUpdate")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    vi.spyOn(meetingDocumentSession, "acknowledge").mockImplementation(() => undefined);
    const resync = vi.fn().mockResolvedValue({ parentChanged: false });
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      resync,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    document.getText("field").insert(0, "not yet saved");
    await settle();
    expect(socket.sent.map((value) => JSON.parse(value)))
      .toContainEqual({ type: "update", envelope: "old-snapshot-envelope" });

    socket.receive({
      type: "rejected",
      code: "E2EE_ENVELOPE_CONTEXT_INVALID",
    });
    await settle();

    expect(resync).toHaveBeenCalledTimes(2);
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(socket.sent.map((value) => JSON.parse(value)))
      .toContainEqual({ type: "update", envelope: "current-snapshot-envelope" });
    expect(provider.status).toBe("pending");

    socket.receive({
      type: "acknowledged",
      envelope: "current-snapshot-envelope",
      clientEpochId: "epoch",
      authorClock: "2",
      serverSequence: "101",
    });
    await settle();
    expect(provider.status).toBe("online");

    provider.destroy();
    document.destroy();
  });

  it("zeroes a plaintext delta when encryption finishes after destruction", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    let finishEncryption!: (pending: {
      envelope: string;
      activeSnapshotId: string;
      authorClock: number;
    }) => void;
    const encryption = new Promise<{
      envelope: string;
      activeSnapshotId: string;
      authorClock: number;
    }>((resolve) => {
      finishEncryption = resolve;
    });
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockReturnValue(encryption);
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );

    document.getText("field").insert(0, "protected");
    await Promise.resolve();
    const plaintext = encrypt.mock.calls[0]?.[1];
    expect(plaintext?.some((byte) => byte !== 0)).toBe(true);
    provider.destroy();
    finishEncryption({ envelope: "envelope", activeSnapshotId: "snapshot", authorClock: 1 });
    await settle();

    expect(plaintext?.every((byte) => byte === 0)).toBe(true);
    document.destroy();
  });

  it("uses canonical discard recovery for an initial terminal ticket failure", async () => {
    const document = new Y.Doc();
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => Promise.reject(Object.assign(new Error("revoked"), {
        code: "AUTH_SESSION_REVOKED",
      })),
      () => new FakeSocket() as unknown as WebSocket,
    );
    const reloadCanonical = vi.spyOn(
      provider as unknown as { reloadCanonical: () => void },
      "reloadCanonical",
    ).mockImplementation(() => undefined);

    await provider.connect();

    expect(reloadCanonical).toHaveBeenCalledOnce();
    provider.destroy();
    document.destroy();
  });

  it("persists a discard notice before reloading canonical state", () => {
    const document = new Y.Doc();
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => new FakeSocket() as unknown as WebSocket,
    );
    vi.spyOn(meetingDocumentSession, "discard").mockImplementation(() => undefined);
    window.sessionStorage.removeItem("elderflow:discarded-collaboration");

    (provider as unknown as { reloadCanonical: () => void }).reloadCanonical();

    expect(window.sessionStorage.getItem("elderflow:discarded-collaboration")).toBe("meeting");
    document.destroy();
  });

  it("does not capture canonical resync changes as local updates", async () => {
    const document = new Y.Doc();
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => new FakeSocket() as unknown as WebSocket,
    );

    document.transact(() => {
      document.getText("field").insert(0, "canonical");
    }, MEETING_COLLABORATION_ORIGIN);
    await settle();

    expect(encrypt).not.toHaveBeenCalled();
    provider.destroy();
    document.destroy();
  });

  it("reconnects after a failed explicit synchronization", async () => {
    const document = new Y.Doc();
    const sockets = [new FakeSocket(), new FakeSocket()];
    let socketIndex = 0;
    let synchronization = 0;
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => sockets[socketIndex++] as unknown as WebSocket,
      undefined,
      async () => {
        synchronization += 1;
        if (synchronization === 2) throw new Error("Network unavailable");
        return { parentChanged: false };
      },
    );
    await provider.connect();
    sockets[0].open();
    sockets[0].receive({ type: "authenticated" });
    await settle();
    expect(provider.status).toBe("online");
    vi.spyOn(window, "setTimeout").mockImplementation((handler: TimerHandler) => {
      queueMicrotask(() => (handler as () => void)());
      return 1 as any;
    });

    await expect(provider.synchronize()).rejects.toThrow("Network unavailable");

    expect(provider.status).toBe("connecting");
    expect(sockets[0].readyState).toBe(WebSocket.CLOSED);
    for (let index = 0; index < 10 && socketIndex < 2; index += 1) {
      await Promise.resolve();
    }
    expect(socketIndex).toBe(2);
    sockets[1].open();
    sockets[1].receive({ type: "authenticated" });
    for (let index = 0; index < 10 && provider.status !== "online"; index += 1) {
      await Promise.resolve();
    }
    expect(provider.status).toBe("online");
    provider.destroy();
    document.destroy();
  });

  it("serializes a new edit behind parent-change resealing", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    let finishReseal!: (pending: {
      envelope: string;
      activeSnapshotId: string;
      authorClock: number;
    }) => void;
    let markResealStarted!: () => void;
    const resealStarted = new Promise<void>((resolve) => {
      markResealStarted = resolve;
    });
    const reseal = new Promise<{
      envelope: string;
      activeSnapshotId: string;
      authorClock: number;
    }>((resolve) => {
      finishReseal = resolve;
    });
    let call = 0;
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return { envelope: "old", activeSnapshotId: "old-snapshot", authorClock: 1 };
        }
        if (call === 2) {
          markResealStarted();
          return reseal;
        }
        return { envelope: "new-edit", activeSnapshotId: "new-snapshot", authorClock: 3 };
      });
    vi.spyOn(meetingDocumentSession, "decryptPendingDocumentUpdate")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      async () => ({ parentChanged: true }),
    );
    await provider.connect();
    socket.open();
    document.getText("field").insert(0, "a");
    await settle();
    socket.receive({ type: "authenticated" });
    await resealStarted;

    document.getText("field").insert(1, "b");
    await Promise.resolve();
    expect(encrypt).toHaveBeenCalledTimes(2);
    finishReseal({ envelope: "rebased", activeSnapshotId: "new-snapshot", authorClock: 2 });
    await settle();

    expect(encrypt).toHaveBeenCalledTimes(3);
    const updateFrames = socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "update");
    expect(updateFrames).toEqual([{ type: "update", envelope: "rebased" }]);
    provider.destroy();
    document.destroy();
  });

  it("does not relay an atomic topic-initialization update a second time", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(6), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000301";
    const keys = {
      organizationId: "00000000-0000-4000-8000-000000000302",
      ockId: "00000000-0000-4000-8000-000000000303",
      clientEpochId: "00000000-0000-4000-8000-000000000304",
      noncePrefix: new Uint8Array(16).fill(7),
      contentKey: new Uint8Array(32).fill(8),
      signingPrivateKey: signing.privateKey,
    };
    meetingDocumentSession.unlock(keys);
    const initial = await meetingDocumentSession.createInitial(meetingId);
    const socket = new FakeSocket();
    const provider = new EncryptedMeetingCollaborationProvider(
      meetingId,
      meetingDocumentSession.document(meetingId),
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ id: "appearance" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetch);
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    await api.addMeetingTopic(meetingId, {
      topicId: "00000000-0000-4000-8000-000000000305",
      sectionId: "00000000-0000-4000-8000-000000000306",
    });
    await settle();

    const relayedUpdates = socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "update");
    expect(relayedUpdates).toEqual([]);

    const mutation = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(fetch.mock.calls[0]?.[1]?.body as Uint8Array) as unknown[];
    const appearanceId = mutation[0] as string;
    replaceMeetingFragment(
      meetingDocumentSession.document(meetingId),
      meetingFragmentId("preparationContext", appearanceId),
      "Saved context",
    );
    await (provider as unknown as { encryption: Promise<void> }).encryption;
    const contextUpdate = socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .find((frame) => frame.type === "update");
    expect(contextUpdate?.envelope).toEqual(expect.any(String));
    const decodedContext = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(base64UrlToBytes(contextUpdate!.envelope!)) as unknown[];
    expect((decodedContext[3] as unknown[])[6]).toBe(2);
    provider.destroy();

    const restored = new MeetingDocumentSession();
    restored.unlock(keys);
    await restored.load(meetingId, {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "2",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId: keys.clientEpochId,
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [
        {
          clientEpochId: keys.clientEpochId,
          authorClock: "1",
          signingPublicKey: bytesToBase64Url(signing.publicKey),
          envelope: bytesToBase64Url(mutation[4] as Uint8Array),
        },
        {
          clientEpochId: keys.clientEpochId,
          authorClock: "2",
          signingPublicKey: bytesToBase64Url(signing.publicKey),
          envelope: contextUpdate!.envelope!,
        },
      ],
    });
    expect(restored.hydrateFragments(meetingId, [{ id: appearanceId, person: false }])
      .appearances.get(appearanceId)?.preparationContext).toBe("Saved context");
    restored.lock();
  });

  it("keeps a pending collaboration counter reserved while adding a Topic after resync", async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(16), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000401";
    const keys = {
      organizationId: "00000000-0000-4000-8000-000000000402",
      ockId: "00000000-0000-4000-8000-000000000403",
      clientEpochId: "00000000-0000-4000-8000-000000000404",
      noncePrefix: new Uint8Array(16).fill(17),
      contentKey: new Uint8Array(32).fill(18),
      signingPrivateKey: signing.privateKey,
    };
    meetingDocumentSession.unlock(keys);
    const initial = await meetingDocumentSession.createInitial(meetingId);
    const workspace = {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "0",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId: keys.clientEpochId,
        snapshotClock: "1",
        coveredAuthorClocks: [],
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [],
    };
    const socket = new FakeSocket();
    const provider = new EncryptedMeetingCollaborationProvider(
      meetingId,
      meetingDocumentSession.document(meetingId),
      async () => ({ ticket: "ticket", documentId: initial.documentId, websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      () => meetingDocumentSession.merge(
        meetingId,
        workspace,
        MEETING_COLLABORATION_ORIGIN,
      ),
    );
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ id: "appearance" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetch);
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    provider.document.getText("field").insert(0, "pending edit");
    await settle();
    await provider.synchronize();
    await api.addMeetingTopic(meetingId, {
      topicId: "00000000-0000-4000-8000-000000000405",
      sectionId: "00000000-0000-4000-8000-000000000406",
    });

    const pendingFrame = socket.sent
      .map((value) => JSON.parse(value) as { type: string; envelope?: string })
      .find((frame) => frame.type === "update");
    const pendingEnvelope = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(base64UrlToBytes(pendingFrame!.envelope!)) as unknown[];
    const mutation = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(fetch.mock.calls[0]?.[1]?.body as Uint8Array) as unknown[];
    const additionEnvelope = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(mutation[4] as Uint8Array) as unknown[];

    expect((pendingEnvelope[3] as unknown[])[6]).toBe(1);
    expect((additionEnvelope[3] as unknown[])[6]).toBe(2);

    provider.destroy();
  });

  it("does not send an awareness envelope after the provider is replaced", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    let finishEncryption!: (envelope: string) => void;
    let markEncryptionStarted!: () => void;
    const encryptionStarted = new Promise<void>((resolve) => {
      markEncryptionStarted = resolve;
    });
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockImplementation(async () => {
      markEncryptionStarted();
      return new Promise<string>((resolve) => {
        finishEncryption = resolve;
      });
    });
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    provider.awareness.setLocalState({ name: "Editor" });
    await encryptionStarted;
    provider.destroy();
    finishEncryption("stale-awareness-envelope");
    await settle();

    expect(socket.sent.some((encoded) => JSON.parse(encoded).type === "awareness")).toBe(false);
    document.destroy();
  });

  it("does not send an older awareness envelope after a newer one", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    const encrypt = vi.spyOn(meetingDocumentSession, "encryptAwareness")
      .mockResolvedValue("initial-awareness");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();

    const resolvers: Array<(envelope: string) => void> = [];
    encrypt.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    provider.awareness.setLocalStateField("cursor", { anchor: 1 });
    provider.awareness.setLocalStateField("cursor", { anchor: 2 });
    await Promise.resolve();

    expect(resolvers).toHaveLength(2);
    resolvers[1]("newer-awareness");
    await settle();
    resolvers[0]("older-awareness");
    await settle();

    const awarenessFrames = socket.sent
      .map((encoded) => JSON.parse(encoded) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "awareness")
      .map((frame) => frame.envelope);
    expect(awarenessFrames).toEqual([
      "initial-awareness",
      "newer-awareness",
    ]);

    provider.destroy();
    document.destroy();
  });

  it("reseals pending work after an author-clock gap instead of blocking later edits", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    const encrypt = vi.spyOn(meetingDocumentSession, "createPendingDocumentUpdate")
      .mockResolvedValueOnce({ envelope: "gapped", activeSnapshotId: "snapshot", authorClock: 2 })
      .mockResolvedValueOnce({ envelope: "recovered", activeSnapshotId: "snapshot", authorClock: 1 });
    vi.spyOn(meetingDocumentSession, "decryptPendingDocumentUpdate")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    const resync = vi.fn().mockResolvedValue({ parentChanged: false });
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
      undefined,
      resync,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();
    document.getText("field").insert(0, "context");
    await (provider as unknown as { encryption: Promise<void> }).encryption;

    socket.receive({ type: "rejected", code: "E2EE_AUTHOR_CLOCK_GAP" });
    await settle();

    expect(resync).toHaveBeenCalledTimes(2);
    expect(encrypt).toHaveBeenCalledTimes(2);
    const updates = socket.sent
      .map((encoded) => JSON.parse(encoded) as { type: string; envelope?: string })
      .filter((frame) => frame.type === "update");
    expect(updates).toEqual([
      { type: "update", envelope: "gapped" },
      { type: "update", envelope: "recovered" },
    ]);
    provider.destroy();
    document.destroy();
  });

  it("does not reject document collaboration when only stale awareness is refused", async () => {
    const document = new Y.Doc();
    const socket = new FakeSocket();
    vi.spyOn(meetingDocumentSession, "encryptAwareness").mockResolvedValue("awareness");
    const provider = new EncryptedMeetingCollaborationProvider(
      "meeting",
      document,
      async () => ({ ticket: "ticket", documentId: "document", websocketPath: "/socket" }),
      () => socket as unknown as WebSocket,
    );
    await provider.connect();
    socket.open();
    socket.receive({ type: "authenticated" });
    await settle();
    expect(provider.status).toBe("online");

    socket.receive({ type: "rejected", code: "E2EE_AWARENESS_REPLAY" });
    await settle();

    expect(provider.status).toBe("online");
    provider.destroy();
    document.destroy();
  });
});
