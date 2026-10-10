import sodium from "libsodium-wrappers-sumo";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import { meetingCollaboration } from "../../e2ee/meeting-collaboration";
import { meetingFragmentId, readMeetingFragment } from "../../e2ee/meeting-document-codec";
import {
  MeetingDocumentSession,
  meetingDocumentSession,
  type EncryptedWorkspace,
} from "../../e2ee/meeting-document-session";
import { bytesToBase64Url } from "../../e2ee/protocol";
import { scalarSession } from "../../e2ee/scalar-session";
import { startMeetingCollaboration } from "./infrastructure";

class Socket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: Socket[] = [];
  readyState = Socket.CONNECTING;
  readonly sent: Array<Record<string, string>> = [];

  constructor(_url: string) {
    super();
    Socket.instances.push(this);
  }

  send(encoded: string) {
    this.sent.push(JSON.parse(encoded));
  }

  open() {
    this.readyState = Socket.OPEN;
    this.dispatchEvent(new Event("open"));
    this.receive({ type: "authenticated" });
  }

  receive(frame: object) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
  }

  close() {
    this.readyState = Socket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

const sessions: MeetingDocumentSession[] = [];
afterEach(() => {
  meetingCollaboration.stopAll();
  meetingDocumentSession.lock();
  scalarSession.lock();
  for (const session of sessions.splice(0)) session.lock();
  Socket.instances = [];
  vi.unstubAllGlobals();
});

it.each(["stale", "refreshed", "missing"] as const)(
  "preserves a peer's new appearance text across repeated compaction and reconnect with a %s agenda",
  async (agendaState) => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(7), "uint8array");
    const peerSigning = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(10), "uint8array");
    const meetingId = "00000000-0000-4000-8000-000000000301";
    const keys = {
      organizationId: "00000000-0000-4000-8000-000000000302",
      ockId: "00000000-0000-4000-8000-000000000303",
      clientEpochId: "00000000-0000-4000-8000-000000000304",
      noncePrefix: new Uint8Array(16).fill(8),
      contentKey: new Uint8Array(32).fill(9),
      signingPrivateKey: signing.privateKey,
    };
    const peerKeys = {
      ...keys,
      clientEpochId: "00000000-0000-4000-8000-000000000305",
      noncePrefix: new Uint8Array(16).fill(11),
      signingPrivateKey: peerSigning.privateKey,
    };
    meetingDocumentSession.unlock(keys);
    scalarSession.unlock(keys);
    const initial = await meetingDocumentSession.createInitial(meetingId);
    let workspace: EncryptedWorkspace = {
      documentId: initial.documentId,
      activeSnapshotId: initial.snapshotId,
      currentServerSequence: "0",
      snapshot: {
        id: initial.snapshotId,
        clientEpochId: keys.clientEpochId,
        snapshotClock: "1",
        signingPublicKey: bytesToBase64Url(signing.publicKey),
        envelope: initial.snapshotEnvelope,
      },
      updates: [],
    };
    const peer = new MeetingDocumentSession();
    const restored = new MeetingDocumentSession();
    sessions.push(peer, restored);
    peer.unlock(peerKeys);
    restored.unlock(keys);
    await peer.load(meetingId, workspace);
    let snapshotClock = 1;
    const snapshots: EncryptedWorkspace[] = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      let result: unknown;
      if (url.endsWith("/collaboration-ticket")) {
        result = { ticket: "ticket", documentId: initial.documentId, websocketPath: "/socket" };
      } else if (url.endsWith("/workspace")) {
        result = workspace;
      } else if (url.endsWith("/workspace/compact")) {
        const headers = new Headers(options?.headers);
        const snapshotId = headers.get("X-ElderFlow-Snapshot-Id")!;
        workspace = {
          ...workspace,
          activeSnapshotId: snapshotId,
          snapshot: {
            id: snapshotId,
            clientEpochId: keys.clientEpochId,
            snapshotClock: String(++snapshotClock),
            coveredAuthorClocks: [[peerKeys.clientEpochId, String(snapshots.length + 1)]],
            signingPublicKey: bytesToBase64Url(signing.publicKey),
            envelope: bytesToBase64Url(options?.body as Uint8Array),
          },
          updates: [],
        };
        snapshots.push(workspace);
        result = {};
      } else throw new Error(`Unexpected request: ${url}`);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }));

    const existingId = "00000000-0000-4000-8000-000000000306";
    const addedId = "00000000-0000-4000-8000-000000000307";
    const personId = "00000000-0000-4000-8000-000000000308";
    const meeting = {
      id: meetingId,
      status: "planned",
      workspace,
      agenda: agendaState === "missing" ? undefined : [{ id: existingId, topic: { type: "generic" } }],
    } as Meeting;
    await startMeetingCollaboration(meeting);
    let socket = Socket.instances[0];
    const provider = meetingCollaboration.get(meetingId)!;
    provider.awareness.setLocalState(null);
    socket.open();
    await vi.waitFor(() => expect(provider.isConnected()).toBe(true));

    const fragments = [
      ["meeting/general-notes", "General notes"],
      ["meeting/opening-input", "Opening input"],
      [meetingFragmentId("preparationContext", existingId), "Existing preparation"],
      [meetingFragmentId("preparationContext", addedId), "New preparation"],
      [meetingFragmentId("meetingMinutes", addedId), "New minutes"],
      [meetingFragmentId("personNote", personId), "New person note"],
    ] as const;
    // A peer adds appearances and edits them, independently of the compactor's agenda metadata.
    for (let round = 1; round <= 5; round += 1) {
      const document = peer.document(meetingId);
      const before = Y.encodeStateVector(document);
      document.transact(() => {
        for (const [fragment, text] of fragments) {
          const field = document.getXmlFragment(`tiptap:${fragment}`);
          if (field.length) field.delete(0, field.length);
          const paragraph = new Y.XmlElement("paragraph");
          const value = new Y.XmlText();
          value.insert(0, text);
          paragraph.insert(0, [value]);
          field.insert(0, [paragraph]);
        }
      });
      const update = await peer.createPendingDocumentUpdate(meetingId, Y.encodeStateAsUpdateV2(document, before));
      const sequence = String(round * 100);
      workspace = { ...workspace, currentServerSequence: sequence, updates: [{
        clientEpochId: peerKeys.clientEpochId,
        authorClock: String(update.authorClock),
        signingPublicKey: bytesToBase64Url(peerSigning.publicKey),
        envelope: update.envelope,
      }] };
      if (round === 2) {
        socket.close();
        await vi.waitFor(() => expect(Socket.instances).toHaveLength(2), { timeout: 2_000 });
        socket = Socket.instances[1];
        socket.open();
        await vi.waitFor(() => expect(provider.isConnected()).toBe(true));
      } else await provider.synchronize();

      if (agendaState === "refreshed") {
        await startMeetingCollaboration({
          ...meeting,
          agenda: [
            ...(meeting.agenda ?? []),
            { id: addedId, topic: { type: "generic" } },
            { id: personId, topic: { type: "person" } },
          ],
        } as Meeting);
      }
      const barrierId = `barrier-${round}`;
      socket.receive({ type: "compaction-barrier", barrierId });
      await vi.waitFor(() => expect(socket.sent).toContainEqual({ type: "compaction-drained", barrierId }));
      socket.receive({ type: "compaction-ready", barrierId, serverSequence: sequence });
      await vi.waitFor(() => expect(snapshots).toHaveLength(round));
      socket.receive({ type: "compaction-released", barrierId, outcome: "compacted" });
      await vi.waitFor(() => expect(provider.status).toBe("online"));
      await restored.load(meetingId, workspace);
      await peer.merge(meetingId, workspace, "snapshot");
      for (const [fragment, text] of fragments) {
        expect(readMeetingFragment(provider.document, fragment)).toBe(`<p>${text}</p>`);
        expect(readMeetingFragment(restored.document(meetingId), fragment)).toBe(`<p>${text}</p>`);
        expect(readMeetingFragment(peer.document(meetingId), fragment)).toBe(`<p>${text}</p>`);
      }
    }
  },
);
