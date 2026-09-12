import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  meetingDocumentSession,
  type PendingEncryptedMeetingUpdate,
} from "./meeting-document-session";

export type CollaborationStatus =
  | "connecting"
  | "online"
  | "offline"
  | "pending"
  | "paused"
  | "resynchronizing"
  | "rejected"
  | "discarded";
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
  private barrierId: string | null = null;
  private barrierDrained = false;
  private pausedPlaintext: Uint8Array[] = [];
  private awarenessGeneration = 0;

  constructor(
    readonly meetingId: string,
    readonly document: Y.Doc,
    private readonly ticket: () => Promise<CollaborationTicket>,
    private readonly socketFactory: (path: string) => WebSocket,
    private readonly compact?: (barrierId: string, serverSequence: string) => Promise<void>,
    private readonly resync?: () => Promise<{ parentChanged: boolean }>,
    private readonly rotateClientEpoch?: () => Promise<void>,
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
    if (this.barrierId) {
      this.pausedPlaintext.push(copy);
      this.setStatus("paused");
      return;
    }
    this.encryptLocalUpdate(copy);
  };

  private encryptLocalUpdate(copy: Uint8Array): void {
    void this.enqueue(async () => {
      if (this.barrierId) {
        this.pausedPlaintext.push(copy);
        this.setStatus("paused");
        return;
      }
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
    }).finally(() => this.acknowledgeBarrierWhenDrained());
  }

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
    await this.sendAwareness(update, socket);
  };

  private async sendAwareness(update: Uint8Array, socket: WebSocket): Promise<void> {
    const generation = ++this.awarenessGeneration;
    try {
      const envelope = await meetingDocumentSession.encryptAwareness(this.meetingId, update);
      if (generation !== this.awarenessGeneration || this.stopped || !this.authenticated
        || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "awareness", envelope }));
    } finally {
      update.fill(0);
    }
  }

  private async message(encoded: string): Promise<void> {
    const frame = JSON.parse(encoded) as Record<string, string>;
    if (frame.type === "authenticated") {
      await this.synchronize();
      this.authenticated = true;
      if (this.barrierId && frame.compactionBarrierId !== this.barrierId) {
        await this.releaseCompactionBarrier(this.barrierId, false);
      }
      this.setStatus(this.pending.length ? "pending" : "online");
      this.flush();
      const clients = [...this.awareness.getStates().keys()];
      const socket = this.socket;
      if (clients.length && socket) await this.sendAwareness(
        encodeAwarenessUpdate(this.awareness, clients),
        socket,
      );
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
      this.acknowledgeBarrierWhenDrained();
      if (!this.barrierId && !this.pending.length
        && Number(frame.serverSequence) % 100 === 0 && !this.compacting) {
        this.requestCompaction(frame.serverSequence);
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
    if (frame.type === "compaction-barrier") {
      this.startCompactionBarrier(frame.barrierId);
      return;
    }
    if (frame.type === "compaction-ready") {
      await this.createCoordinatedCompaction(frame.barrierId, frame.serverSequence);
      return;
    }
    if (frame.type === "compaction-released") {
      await this.releaseCompactionBarrier(frame.barrierId, frame.outcome === "compacted");
      return;
    }
    if (frame.type === "rejected") {
      if (frame.code === "E2EE_COMPACTION_NOT_REQUIRED") {
        this.compacting = false;
        return;
      }
      if ([
        "MEETING_COMPLETED_IMMUTABLE",
        "E2EE_CLIENT_EPOCH_INVALID",
        "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
      ].includes(frame.code)) {
        this.reloadCanonical();
      } else if (frame.code === "E2EE_SNAPSHOT_PARENT_INVALID") {
        this.setStatus("connecting");
        await this.synchronize(true);
      } else if (["E2EE_ENVELOPE_CONTEXT_INVALID", "E2EE_AUTHOR_CLOCK_GAP"].includes(frame.code)) {
        await this.recoverPendingWithFreshEpoch();
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
    this.setStatus(this.barrierId ? "paused" : this.pending.length ? "pending" : "online");
  }

  private closed(): void {
    this.authenticated = false;
    this.compacting = false;
    this.sent.clear();
    this.socket = null;
    if (this.stopped || this.status === "discarded") return;
    this.setStatus(this.pending.length || this.pausedPlaintext.length ? "pending" : "offline");
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
    try {
      await this.enqueue(async () => {
        const { parentChanged } = await this.resync?.() ?? { parentChanged: false };
        if ((parentChanged || rebasePending) && this.pending.length) await this.rebasePending();
      });
    } catch (error) {
      if (!this.stopped && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.close();
      } else if (!this.stopped) {
        this.setStatus(this.pending.length ? "pending" : "offline");
      }
      throw error;
    }
  }

  async readyForCompletion(): Promise<boolean> {
    let queued = this.encryption;
    await queued;
    while (queued !== this.encryption) {
      queued = this.encryption;
      await queued;
    }
    return !this.stopped
      && this.status === "online"
      && this.pending.length === 0
      && this.sent.size === 0
      && !this.barrierId
      && this.pausedPlaintext.length === 0;
  }

  private requestCompaction(serverSequence: string): void {
    this.compacting = true;
    this.socket?.send(JSON.stringify({
      type: "request-compaction",
      triggerServerSequence: serverSequence,
    }));
  }

  private startCompactionBarrier(barrierId: string): void {
    if (!barrierId || this.barrierId) return;
    this.barrierId = barrierId;
    this.barrierDrained = false;
    this.setStatus("paused");
    const queued = this.encryption;
    void queued.then(() => this.acknowledgeBarrierWhenDrained());
  }

  private acknowledgeBarrierWhenDrained(): void {
    if (!this.barrierId || this.barrierDrained || this.pending.length || this.sent.size
      || !this.authenticated || this.socket?.readyState !== WebSocket.OPEN) return;
    this.barrierDrained = true;
    this.socket.send(JSON.stringify({
      type: "compaction-drained",
      barrierId: this.barrierId,
    }));
  }

  private async createCoordinatedCompaction(
    barrierId: string,
    serverSequence: string,
  ): Promise<void> {
    if (this.barrierId !== barrierId || !this.barrierDrained) return;
    try {
      this.setStatus("resynchronizing");
      await this.synchronize();
      this.setStatus("paused");
      await this.compact?.(barrierId, serverSequence);
    } catch {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "compaction-failed", barrierId }));
      }
    }
  }

  private async releaseCompactionBarrier(barrierId: string, compacted: boolean): Promise<void> {
    if (this.barrierId !== barrierId) return;
    if (compacted) {
      this.setStatus("resynchronizing");
      await this.synchronize();
    }
    const plaintext = this.pausedPlaintext;
    this.pausedPlaintext = [];
    this.barrierId = null;
    this.barrierDrained = false;
    this.compacting = false;
    if (!plaintext.length) {
      this.flush();
      return;
    }
    this.setStatus("pending");
    for (const update of plaintext) this.encryptLocalUpdate(update);
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

  private async recoverPendingWithFreshEpoch(): Promise<void> {
    const rotateClientEpoch = this.rotateClientEpoch;
    if (!rotateClientEpoch) {
      this.setStatus("rejected");
      return;
    }
    this.setStatus("resynchronizing");
    await this.enqueue(async () => {
      const plaintext: Uint8Array[] = [];
      try {
        for (const pending of this.pending) {
          plaintext.push(await meetingDocumentSession.decryptPendingDocumentUpdate(
            this.meetingId,
            pending,
          ));
        }
        await this.resync?.();
        await rotateClientEpoch();
        this.pending = [];
        this.sent.clear();
        for (const update of plaintext) {
          this.pending.push(await meetingDocumentSession.createPendingDocumentUpdate(
            this.meetingId,
            update,
          ));
        }
        this.flush();
      } finally {
        for (const update of plaintext) update.fill(0);
      }
    });
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
    for (const update of this.pausedPlaintext) update.fill(0);
    this.pausedPlaintext = [];
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
let rotateClientEpoch: (() => Promise<void>) | undefined;
export const meetingCollaboration = {
  setEpochRotator: (rotator: () => Promise<void>) => {
    rotateClientEpoch = rotator;
  },
  get: (meetingId: string) => providers.get(meetingId),
  start: async (
    meetingId: string,
    ticket: () => Promise<CollaborationTicket>,
    socketFactory: (path: string) => WebSocket,
    compact?: (barrierId: string, serverSequence: string) => Promise<void>,
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
      rotateClientEpoch,
    );
    providers.set(meetingId, provider);
    window.dispatchEvent(new CustomEvent("elderflow:meeting-collaboration-started", {
      detail: meetingId,
    }));
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
