import sodium from "libsodium-wrappers-sumo";
import { afterEach, expect, it, vi } from "vitest";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import { MeetingDocumentSession, meetingDocumentSession, type EncryptedWorkspace } from "../e2ee/meeting-document-session";
import { scalarSession } from "../e2ee/scalar-session";
import { bytesToBase64Url, base64UrlToBytes } from "../e2ee/protocol";
import { meetingFragmentId } from "../e2ee/meeting-document-codec";
import { startMeetingCollaboration } from "../meetings/workspace/infrastructure";
import { completeWithMentions, type CompletionSubmission } from "./completion";
import type { Meeting } from "../api/domain";
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

it.each([false, true])("captures a collaborator's final mention only after the stable barrier (lock before submit: %s)", async (lock) => {
  await sodium.ready;
  const signing = sodium.crypto_sign_keypair();
  const peerSigning = sodium.crypto_sign_keypair();
  const meetingId = crypto.randomUUID();
  const appearanceId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const barrierId = crypto.randomUUID();
  const keys = {
    organizationId: crypto.randomUUID(), ockId: crypto.randomUUID(), clientEpochId: crypto.randomUUID(),
    noncePrefix: new Uint8Array(16).fill(8), contentKey: new Uint8Array(32).fill(9), signingPrivateKey: signing.privateKey,
  };
  meetingDocumentSession.unlock(keys);
  scalarSession.unlock(keys);
  const initial = await meetingDocumentSession.createInitial(meetingId);
  let workspace: EncryptedWorkspace = {
    documentId: initial.documentId, activeSnapshotId: initial.snapshotId, currentServerSequence: "0",
    snapshot: { id: initial.snapshotId, clientEpochId: keys.clientEpochId, snapshotClock: "1",
      signingPublicKey: bytesToBase64Url(signing.publicKey), envelope: initial.snapshotEnvelope }, updates: [],
  };
  const peer = new MeetingDocumentSession();
  sessions.push(peer);
  const peerEpoch = crypto.randomUUID();
  peer.unlock({ ...keys, clientEpochId: peerEpoch, noncePrefix: new Uint8Array(16).fill(11), signingPrivateKey: peerSigning.privateKey });
  await peer.load(meetingId, workspace);
  const meeting = { id: meetingId, status: "in_progress", workspace,
    agenda: [{ id: appearanceId, topic: { type: "generic" } }] } as Meeting;
  let cancelled = false;
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    let result: unknown;
    const socket = Socket.instances[0];
    if (url.endsWith("/collaboration-ticket")) result = { ticket: "ticket", documentId: initial.documentId, websocketPath: "/socket" };
    else if (url.endsWith("/workspace")) result = workspace;
    else if (url.endsWith("/completion/prepare")) {
      // Another unlocked client sends its final edit while completion is draining.
      const envelope = await peer.createFragmentUpdate(meetingId, meetingFragmentId("meetingMinutes", appearanceId),
        `<p>Before <span data-type="mention" data-id="${userId}" data-label="Daniel">@Daniel</span> speaks to Dr. X.</p>`);
      workspace = { ...workspace, currentServerSequence: "1", updates: [{ clientEpochId: peerEpoch,
        authorClock: "1", signingPublicKey: bytesToBase64Url(peerSigning.publicKey), envelope }] };
      socket.receive({ type: "completion-barrier", barrierId });
      await vi.waitFor(() => expect(socket.sent).toContainEqual({ type: "completion-drained", barrierId }));
      socket.receive({ type: "completion-sequence", barrierId, serverSequence: "1" });
      await vi.waitFor(() => expect(socket.sent).toContainEqual({ type: "completion-confirmed", barrierId, serverSequence: "1" }));
      result = { barrierId, documentId: initial.documentId, serverSequence: "1" };
    } else if (options?.method === "DELETE") {
      cancelled = true;
      socket.receive({ type: "completion-released", barrierId, outcome: "aborted" });
      result = {};
    } else if (url === `/api/meetings/${meetingId}`) {
      if (lock) scalarSession.lock();
      result = meeting;
    } else throw new Error("Unexpected test request");
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }));
  await startMeetingCollaboration(meeting);
  const provider = meetingCollaboration.get(meetingId)!;
  provider.awareness.setLocalState(null);
  Socket.instances[0].open();
  await vi.waitFor(() => expect(provider.isConnected()).toBe(true));
  const submit = vi.fn(async (input: CompletionSubmission) => input);
  if (lock) {
    await expect(completeWithMentions(meetingId, submit)).rejects.toThrow("E2EE_PROTECTED_TEXT_LOCKED");
    expect(cancelled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(provider.isEditingPaused()).toBe(false));
  } else {
    const result = await completeWithMentions(meetingId, submit);
    expect(result.serverSequence).toBe("1");
    expect(provider.isEditingPaused()).toBe(true);
    const mention = result.appearances[0].mentions[0];
    expect(mention.userId).toBe(userId);
    const plaintext = await scalarSession.decrypt({ aggregateType: 260, recordId: mention.id, fieldId: 1 }, base64UrlToBytes(mention.contextEnvelope));
    expect(JSON.parse(plaintext!)).toMatchObject({ meetingId, appearanceId, serverSequence: "1", context: "Before @Daniel speaks to Dr. X." });
    expect(JSON.stringify(result)).not.toContain("Daniel");
  }
});
