import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  meetingDocumentSession,
  type PendingEncryptedMeetingUpdate,
} from "./meeting-document-session";

export type CollaborationStatus = "connecting" | "online" | "offline" | "pending" | "rejected" | "discarded";
export interface CollaborationTicket {
  ticket: string;
  documentId: string;
  websocketPath: string;
}

export const MEETING_COLLABORATION_ORIGIN = Symbol("encrypted-meeting-collaboration");

export class EncryptedMeetingCollaborationProvider extends EventTarget {
  readonly awareness: Awareness;
  status: CollaborationStatus = "connecting";
  private socket: WebSocket | null = null;
  private pending: PendingEncryptedMeetingUpdate[] = [];
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
    private readonly resync?: () => Promise<{ parentChanged: boolean }>,
  ) {
    super();
    this.awareness = new Awareness(document);
    document.on("updateV2", this.localUpdate);
    this.awareness.on("update", this.localAwareness);
  }

  async connect(): Promise<void> {
    this.setStatus("connecting");
    let credentials: CollaborationTicket;
    try {
      credentials = await this.ticket();
    } catch (error) {
      if (this.isTerminalAccessError(error)) {
        this.reloadCanonical();
        return;
      }
      throw error;
    }
    if (this.stopped) return;
    const socket = this.socketFactory(credentials.websocketPath);
    this.socket = socket;
    socket.addEventListener("open", () => socket.send(JSON.stringify({
      type: "authenticate",
      ticket: credentials.ticket,
      documentId: credentials.documentId,
    })));
    socket.addEventListener("message", (event) => {
      void this.message(String(event.data)).catch((error: unknown) => {
        if ((error as Error)?.message === "E2EE_MEETING_DOCUMENT_CONTEXT_INVALID") {
          void this.synchronize().catch(() => this.setStatus("rejected"));
        } else this.setStatus("rejected");
      });
    });
    socket.addEventListener("close", () => this.closed());
    socket.addEventListener("error", () => this.setStatus("offline"));
  }

  destroy(): void {
    this.stopped = true;
    this.clearPending();
    this.document.off("updateV2", this.localUpdate);
    this.awareness.off("update", this.localAwareness);
    this.awareness.destroy();
    this.socket?.close();
    this.socket = null;
  }

  private readonly localUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === MEETING_COLLABORATION_ORIGIN || this.stopped) return;
    const copy = Uint8Array.from(update);
    void this.enqueue(async () => {
      try {
        const pending = await meetingDocumentSession.createPendingDocumentUpdate(this.meetingId, copy);
        copy.fill(0);
        if (this.stopped) {
          return;
        }
        this.pending.push(pending);
        this.flush();
      } catch (error) {
        copy.fill(0);
        throw error;
      }
    }).catch(() => {
      if (!this.stopped) this.setStatus("rejected");
    });
  };

  private readonly localAwareness = async (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): Promise<void> => {
    if (origin === MEETING_COLLABORATION_ORIGIN
      || !this.authenticated || this.socket?.readyState !== WebSocket.OPEN) return;
    const socket = this.socket;
    const update = encodeAwarenessUpdate(this.awareness, [
      ...change.added,
      ...change.updated,
      ...change.removed,
    ]);
    try {
      const envelope = await meetingDocumentSession.encryptAwareness(this.meetingId, update);
      if (this.stopped || !this.authenticated || this.socket !== socket
        || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "awareness", envelope }));
    } finally {
      update.fill(0);
    }
  };

  private async message(encoded: string): Promise<void> {
    const frame = JSON.parse(encoded) as Record<string, string>;
    if (frame.type === "authenticated") {
      await this.synchronize();
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
      const index = this.pending.findIndex((pending) => pending.envelope === frame.envelope);
      if (index >= 0) this.pending.splice(index, 1);
      this.sent.delete(frame.envelope);
      meetingDocumentSession.acknowledge(
        this.meetingId,
        frame.clientEpochId,
        frame.authorClock,
        frame.serverSequence,
      );
      this.flush();
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
        serverSequence: string;
      };
      const result = await meetingDocumentSession.applyRemoteUpdate(
        this.meetingId,
        update,
        MEETING_COLLABORATION_ORIGIN,
      );
      if (result === "gap") await this.synchronize();
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
        MEETING_COLLABORATION_ORIGIN,
      );
      return;
    }
    if (frame.type === "parent-changed") {
      await this.synchronize();
      return;
    }
    if (frame.type === "rejected") {
      if ([
        "MEETING_COMPLETED_IMMUTABLE",
        "E2EE_CLIENT_EPOCH_INVALID",
        "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
      ].includes(frame.code)) {
        this.reloadCanonical();
      } else if (["E2EE_SNAPSHOT_PARENT_INVALID", "E2EE_ENVELOPE_CONTEXT_INVALID"].includes(frame.code)) {
        this.setStatus("connecting");
        await this.synchronize();
      } else if (frame.code === "E2EE_AUTHOR_CLOCK_GAP") {
        this.setStatus("connecting");
        await this.synchronize(true);
      } else if (frame.code === "E2EE_AWARENESS_REPLAY") {
        return;
      } else this.setStatus("rejected");
    }
  }

  private flush(): void {
    if (!this.authenticated || this.socket?.readyState !== WebSocket.OPEN) {
      this.setStatus(this.pending.length ? "pending" : "offline");
      return;
    }
    const pending = this.pending.find((candidate) => !this.sent.has(candidate.envelope));
    if (pending && this.sent.size === 0) {
      this.socket.send(JSON.stringify({ type: "update", envelope: pending.envelope }));
      this.sent.add(pending.envelope);
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
    window.setTimeout(() => void this.connect().catch((error: unknown) => {
      if (this.isTerminalAccessError(error)) {
        this.reloadCanonical();
        return;
      }
      this.setStatus("offline");
      if (!this.stopped) this.reconnect();
    }), 1_000);
  }

  async synchronize(rebasePending = false): Promise<void> {
    await this.enqueue(async () => {
      const { parentChanged } = await this.resync?.() ?? { parentChanged: false };
      if ((parentChanged || rebasePending) && this.pending.length) await this.rebasePending();
    });
  }

  private async rebasePending(): Promise<void> {
    this.sent.clear();
    for (let index = 0; index < this.pending.length; index += 1) {
      if (this.stopped) return;
      const pending = this.pending[index];
      const plaintext = await meetingDocumentSession.decryptPendingDocumentUpdate(
        this.meetingId,
        pending,
      );
      try {
        const rebased = await meetingDocumentSession.createPendingDocumentUpdate(
          this.meetingId,
          plaintext,
        );
        if (this.stopped) return;
        this.pending[index] = rebased;
      } finally {
        plaintext.fill(0);
      }
    }
    this.flush();
  }

  private isTerminalAccessError(error: unknown): boolean {
    return [
      "AUTH_SESSION_REVOKED",
      "AUTH_USER_NOT_FOUND",
      "MEETING_COMPLETED_IMMUTABLE",
      "E2EE_CLIENT_EPOCH_INVALID",
      "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
    ].includes((error as { code?: string })?.code ?? "");
  }

  private reloadCanonical(): void {
    this.clearPending();
    meetingDocumentSession.discard(this.meetingId);
    window.sessionStorage.setItem("elderflow:discarded-collaboration", this.meetingId);
    this.setStatus("discarded");
    this.destroy();
    window.location.reload();
  }

  private clearPending(): void {
    this.pending = [];
    this.sent.clear();
  }

  private setStatus(status: CollaborationStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent("status", { detail: status }));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.encryption.then(operation);
    this.encryption = queued.then(() => undefined, () => undefined);
    return queued;
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
    resync?: () => Promise<{ parentChanged: boolean }>,
  ) => {
    providers.get(meetingId)?.destroy();
    const provider = new EncryptedMeetingCollaborationProvider(
      meetingId,
      meetingDocumentSession.document(meetingId),
      ticket,
      socketFactory,
      compact,
      resync,
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
