// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { meetingDocumentSession } from "./meeting-document-session";
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
  afterEach(() => vi.restoreAllMocks());

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
});
