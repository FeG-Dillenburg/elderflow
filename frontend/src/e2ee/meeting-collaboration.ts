import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import type * as Y from "yjs";
import { meetingDocumentSession } from "./meeting-document-session";

export type CollaborationStatus = "connecting" | "online" | "offline" | "pending" | "rejected" | "discarded";
export interface CollaborationTicket {
  ticket: string;
  documentId: string;
  websocketPath: string;
}

const REMOTE_ORIGIN = Symbol("encrypted-meeting-collaboration");

export class EncryptedMeetingCollaborationProvider extends EventTarget {
  readonly awareness: Awareness;
  status: CollaborationStatus = "connecting";
  private socket: WebSocket | null = null;
  private pending: string[] = [];
  private sent = new Set<string>();
  private encryption = Promise.resolve();
  private stopped = false;
  private authenticated = false;
  private compacting = false;

  constructor(
    readonly meetingId: string,
    readonly document: Y.Doc,
    private readonly ticket: () => Promise<CollaborationTicket>,
    private readonly socketFactory: (path: string) => WebSocket,
    private readonly compact?: () => Promise<void>,
  ) {
    super();
    this.awareness = new Awareness(document);
    document.on("updateV2", this.localUpdate);
    this.awareness.on("update", this.localAwareness);
  }

  async connect(): Promise<void> {
    this.setStatus("connecting");
    const credentials = await this.ticket();
    if (this.stopped) return;
    const socket = this.socketFactory(credentials.websocketPath);
    this.socket = socket;
    socket.addEventListener("open", () => socket.send(JSON.stringify({
      type: "authenticate",
      ticket: credentials.ticket,
      documentId: credentials.documentId,
    })));
    socket.addEventListener("message", (event) => void this.message(String(event.data)));
    socket.addEventListener("close", () => this.closed());
    socket.addEventListener("error", () => this.setStatus("offline"));
  }

  destroy(): void {
    this.stopped = true;
    this.document.off("updateV2", this.localUpdate);
    this.awareness.off("update", this.localAwareness);
    this.awareness.destroy();
    this.socket?.close();
    this.socket = null;
  }

  private readonly localUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN || this.stopped) return;
    const copy = Uint8Array.from(update);
    this.encryption = this.encryption.then(async () => {
      const envelope = await meetingDocumentSession.createDocumentUpdate(this.meetingId, copy);
      copy.fill(0);
      this.pending.push(envelope);
      this.flush();
    }).catch(() => this.setStatus("rejected"));
  };

  private readonly localAwareness = async (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): Promise<void> => {
    if (origin === REMOTE_ORIGIN || !this.authenticated || this.socket?.readyState !== WebSocket.OPEN) return;
    const update = encodeAwarenessUpdate(this.awareness, [
      ...change.added,
      ...change.updated,
      ...change.removed,
    ]);
    const envelope = await meetingDocumentSession.encryptAwareness(this.meetingId, update);
    this.socket.send(JSON.stringify({ type: "awareness", envelope }));
  };

  private async message(encoded: string): Promise<void> {
    const frame = JSON.parse(encoded) as Record<string, string>;
    if (frame.type === "authenticated") {
      this.authenticated = true;
      this.setStatus(this.pending.length ? "pending" : "online");
      this.flush();
      const clients = [...this.awareness.getStates().keys()];
      if (clients.length) {
        const envelope = await meetingDocumentSession.encryptAwareness(
          this.meetingId,
          encodeAwarenessUpdate(this.awareness, clients),
        );
        this.socket?.send(JSON.stringify({ type: "awareness", envelope }));
      }
      return;
    }
    if (frame.type === "acknowledged") {
      const index = this.pending.indexOf(frame.envelope);
      if (index >= 0) this.pending.splice(index, 1);
      this.sent.delete(frame.envelope);
      meetingDocumentSession.acknowledge(
        this.meetingId,
        frame.clientEpochId,
        frame.authorClock,
        frame.serverSequence,
      );
      this.setStatus(this.pending.length ? "pending" : "online");
      if (!this.pending.length && Number(frame.serverSequence) % 100 === 0 && !this.compacting) {
        this.compacting = true;
        void this.compact?.().catch(() => this.setStatus("rejected")).finally(() => {
          this.compacting = false;
        });
      }
      return;
    }
    if (frame.type === "update") {
      const update = frame as unknown as {
        clientEpochId: string;
        authorClock: string;
        signingPublicKey: string;
        envelope: string;
      };
      await meetingDocumentSession.applyRemoteUpdate(this.meetingId, update, REMOTE_ORIGIN);
      return;
    }
    if (frame.type === "awareness") {
      applyAwarenessUpdate(
        this.awareness,
        await meetingDocumentSession.decryptAwareness(this.meetingId, frame as unknown as {
          clientEpochId: string;
          awarenessClock: string;
          signingPublicKey: string;
          envelope: string;
        }),
        REMOTE_ORIGIN,
      );
      return;
    }
    if (frame.type === "rejected") {
      if (frame.code === "MEETING_COMPLETED_IMMUTABLE") {
        this.pending = [];
        this.sent.clear();
        meetingDocumentSession.discard(this.meetingId);
        this.setStatus("discarded");
        this.destroy();
      } else this.setStatus("rejected");
    }
  }

  private flush(): void {
    if (!this.authenticated || this.socket?.readyState !== WebSocket.OPEN) {
      this.setStatus(this.pending.length ? "pending" : "offline");
      return;
    }
    for (const envelope of this.pending) {
      if (!this.sent.has(envelope)) {
        this.socket.send(JSON.stringify({ type: "update", envelope }));
        this.sent.add(envelope);
      }
    }
    this.setStatus(this.pending.length ? "pending" : "online");
  }

  private closed(): void {
    this.authenticated = false;
    this.sent.clear();
    this.socket = null;
    if (this.stopped || this.status === "discarded") return;
    this.setStatus(this.pending.length ? "pending" : "offline");
    this.reconnect();
  }

  private reconnect(): void {
    window.setTimeout(() => void this.connect().catch(() => {
      this.setStatus("offline");
      if (!this.stopped) this.reconnect();
    }), 1_000);
  }

  private setStatus(status: CollaborationStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent("status", { detail: status }));
  }
}

const providers = new Map<string, EncryptedMeetingCollaborationProvider>();
export const meetingCollaboration = {
  get: (meetingId: string) => providers.get(meetingId),
  start: async (
    meetingId: string,
    ticket: () => Promise<CollaborationTicket>,
    socketFactory: (path: string) => WebSocket,
    compact?: () => Promise<void>,
  ) => {
    providers.get(meetingId)?.destroy();
    const provider = new EncryptedMeetingCollaborationProvider(
      meetingId,
      meetingDocumentSession.document(meetingId),
      ticket,
      socketFactory,
      compact,
    );
    providers.set(meetingId, provider);
    await provider.connect();
    return provider;
  },
  stop: (meetingId: string) => {
    providers.get(meetingId)?.destroy();
    providers.delete(meetingId);
  },
  stopAll: () => {
    for (const provider of providers.values()) provider.destroy();
    providers.clear();
  },
};
