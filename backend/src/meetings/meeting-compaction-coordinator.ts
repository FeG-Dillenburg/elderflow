import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { codedHttpException } from "../errors/coded-http.exception";
import {
  meetingCollaborationEvents,
  type MeetingCompactionReleasedEvent,
} from "./meeting-collaboration-events";

type BarrierPhase = "draining" | "confirming" | "ready" | "committing";

interface CompactionBarrier {
  intention: "compaction" | "completion";
  completion?: {
    readSequence: () => Promise<string>;
    confirmed: Set<string>;
    resolve: (claim: { barrierId: string; serverSequence: string }) => void;
    reject: (error: Error) => void;
  };
  id: string;
  meetingId: string;
  documentId: string;
  compactorConnectionId: string;
  compactorUserId: string;
  participants: Set<string>;
  drained: Set<string>;
  phase: BarrierPhase;
  serverSequence: string | null;
  timeout: ReturnType<typeof setTimeout>;
}

export interface OpenCompactionBarrier {
  intention: "compaction" | "completion";
  barrierId: string;
  participantIds: string[];
}

export interface ReadyCompactionBarrier {
  barrierId: string;
  compactorConnectionId: string;
  serverSequence: string;
}

@Injectable()
export class MeetingCompactionCoordinator {
  private readonly barriers = new Map<string, CompactionBarrier>();
  private readonly connections = new Map<string, Set<string>>();
  private readonly collaborationWriters = new Map<string, number>();
  private readonly externalWriters = new Map<string, number>();
  private readonly timeoutMs = 5_000;

  open(input: {
    meetingId: string;
    documentId: string;
    compactorConnectionId: string;
    compactorUserId: string;
    participantIds: string[];
  }): OpenCompactionBarrier | null {
    if ((this.externalWriters.get(input.meetingId) ?? 0) > 0) return null;
    const existing = this.barriers.get(input.documentId);
    if (existing) {
      return {
        intention: existing.intention,
        barrierId: existing.id,
        participantIds: [...existing.participants],
      };
    }
    const id = randomUUID();
    const barrier: CompactionBarrier = {
      intention: "compaction",
      id,
      meetingId: input.meetingId,
      documentId: input.documentId,
      compactorConnectionId: input.compactorConnectionId,
      compactorUserId: input.compactorUserId,
      participants: new Set(input.participantIds),
      drained: new Set(),
      phase: "draining",
      serverSequence: null,
      timeout: setTimeout(() => this.abort(input.documentId, id), this.timeoutMs),
    };
    this.barriers.set(input.documentId, barrier);
    return { intention: barrier.intention, barrierId: id, participantIds: [...barrier.participants] };
  }

  join(documentId: string, participantId: string): OpenCompactionBarrier | null {
    const connections = this.connections.get(documentId) ?? new Set<string>();
    connections.add(participantId);
    this.connections.set(documentId, connections);
    const barrier = this.barriers.get(documentId);
    if (!barrier) return null;
    if (barrier.intention === "completion" && barrier.phase === "committing") {
      return { intention: barrier.intention, barrierId: barrier.id, participantIds: [participantId] };
    }
    barrier.participants.add(participantId);
    barrier.completion?.confirmed.clear();
    if (barrier.phase !== "committing") {
      barrier.phase = "draining";
      barrier.serverSequence = null;
    }
    return { intention: barrier.intention, barrierId: barrier.id, participantIds: [participantId] };
  }

  acknowledge(documentId: string, barrierId: string, participantId: string): boolean {
    const barrier = this.barriers.get(documentId);
    if (!barrier || barrier.id !== barrierId || !barrier.participants.has(participantId)
      || barrier.phase !== "draining") return false;
    barrier.drained.add(participantId);
    return barrier.drained.size === barrier.participants.size;
  }

  ready(documentId: string, barrierId: string, serverSequence: string): ReadyCompactionBarrier | null {
    const barrier = this.barriers.get(documentId);
    if (!barrier || barrier.id !== barrierId || barrier.phase !== "draining"
      || barrier.drained.size !== barrier.participants.size) return null;
    barrier.phase = "ready";
    barrier.serverSequence = serverSequence;
    return {
      barrierId,
      compactorConnectionId: barrier.compactorConnectionId,
      serverSequence,
    };
  }

  claim(meetingId: string, barrierId: string, userId: string): string {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId || barrier.compactorUserId !== userId
      || barrier.intention !== "compaction" || barrier.phase !== "ready" || !barrier.serverSequence) {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "E2EE_COMPACTION_BARRIER_INVALID",
        "Meeting compaction barrier is not ready",
      );
    }
    barrier.phase = "committing";
    clearTimeout(barrier.timeout);
    return barrier.serverSequence;
  }

  assertClaim(meetingId: string, barrierId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId || barrier.phase !== "committing") {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "E2EE_COMPACTION_BARRIER_INVALID",
        "Meeting compaction barrier expired before commit",
      );
    }
  }

  complete(meetingId: string, barrierId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId) return;
    this.release(barrier, barrier.intention === "completion" ? "completed" : "compacted");
  }

  fail(meetingId: string, barrierId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId) return;
    this.release(barrier, "aborted");
  }

  abort(documentId: string, barrierId?: string): void {
    const barrier = this.barriers.get(documentId);
    if (!barrier || barrier.phase === "committing" || (barrierId && barrier.id !== barrierId)) return;
    this.release(barrier, "aborted");
  }

  abortMeeting(meetingId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.meetingId === meetingId);
    if (barrier && barrier.phase !== "committing") this.release(barrier, "aborted");
  }

  disconnected(documentId: string, participantId: string): void {
    const connections = this.connections.get(documentId);
    connections?.delete(participantId);
    if (connections?.size === 0) this.connections.delete(documentId);
    const barrier = this.barriers.get(documentId);
    if (barrier?.participants.has(participantId) && barrier.phase !== "committing") {
      this.release(barrier, "aborted");
    }
  }

  prepareUpdate(documentId: string, participantId: string): boolean {
    const barrier = this.barriers.get(documentId);
    if (!barrier) return true;
    if (barrier.phase === "committing") return false;
    if (barrier.drained.has(participantId)) this.release(barrier, "aborted");
    return true;
  }

  beginExternalUpdate(meetingId: string): boolean {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.meetingId === meetingId);
    if (barrier?.phase === "committing") return false;
    if (barrier) this.release(barrier, "aborted");
    this.externalWriters.set(meetingId, (this.externalWriters.get(meetingId) ?? 0) + 1);
    return true;
  }

  endExternalUpdate(meetingId: string): void {
    const writers = this.externalWriters.get(meetingId) ?? 0;
    if (writers <= 1) this.externalWriters.delete(meetingId);
    else this.externalWriters.set(meetingId, writers - 1);
  }

  current(documentId: string): OpenCompactionBarrier | null {
    const barrier = this.barriers.get(documentId);
    return barrier ? { intention: barrier.intention, barrierId: barrier.id, participantIds: [...barrier.participants] } : null;
  }

  async beginCompletion(
    meetingId: string,
    documentId: string,
    userId: string,
    readSequence: () => Promise<string>,
  ): Promise<{ barrierId: string; serverSequence: string }> {
    if (this.barriers.has(documentId) || (this.externalWriters.get(meetingId) ?? 0) > 0) {
      throw this.completionAborted();
    }
    const opened = this.open({
      meetingId, documentId, compactorUserId: userId, compactorConnectionId: "",
      participantIds: [...(this.connections.get(documentId) ?? [])],
    })!;
    const barrier = this.barriers.get(documentId)!;
    barrier.intention = "completion";
    const result = new Promise<{ barrierId: string; serverSequence: string }>((resolve, reject) => {
      barrier.completion = { readSequence, confirmed: new Set(), resolve, reject };
    });
    meetingCollaborationEvents.emit("completion-barrier", {
      documentId, barrierId: opened.barrierId,
    });
    void this.captureCompletionSequence(barrier);
    return result;
  }

  async completionDrained(documentId: string, barrierId: string, participantId: string): Promise<void> {
    const barrier = this.barriers.get(documentId);
    if (barrier?.intention !== "completion") return;
    if (this.acknowledge(documentId, barrierId, participantId)) {
      await this.captureCompletionSequence(barrier);
    }
  }

  confirmCompletion(documentId: string, barrierId: string, participantId: string, sequence: string): void {
    const barrier = this.barriers.get(documentId);
    if (!barrier?.completion || barrier.id !== barrierId || barrier.phase !== "confirming"
      || barrier.serverSequence !== sequence || !barrier.participants.has(participantId)) return;
    barrier.completion.confirmed.add(participantId);
    this.claimCompletion(barrier);
  }

  beginCollaborationUpdate(meetingId: string): boolean {
    const barrier = [...this.barriers.values()].find((entry) => entry.meetingId === meetingId);
    if (barrier?.phase === "committing") return false;
    this.collaborationWriters.set(meetingId, (this.collaborationWriters.get(meetingId) ?? 0) + 1);
    return true;
  }

  endCollaborationUpdate(meetingId: string): void {
    const count = this.collaborationWriters.get(meetingId) ?? 0;
    if (count <= 1) this.collaborationWriters.delete(meetingId);
    else this.collaborationWriters.set(meetingId, count - 1);
  }

  private async captureCompletionSequence(barrier: CompactionBarrier): Promise<void> {
    if (!barrier.completion || barrier.phase !== "draining"
      || barrier.drained.size !== barrier.participants.size) return;
    // Freeze the drain round while the authoritative sequence is read. A join
    // resets it to draining; a write by an already-drained client aborts it.
    barrier.phase = "confirming";
    try {
      const sequence = await barrier.completion.readSequence();
      if (this.barriers.get(barrier.documentId) !== barrier || barrier.phase !== "confirming") return;
      if ((this.collaborationWriters.get(barrier.meetingId) ?? 0) > 0) {
        this.abort(barrier.documentId, barrier.id);
        return;
      }
      barrier.serverSequence = sequence;
      meetingCollaborationEvents.emit("completion-sequence", {
        documentId: barrier.documentId, barrierId: barrier.id, serverSequence: sequence,
      });
      this.claimCompletion(barrier);
    } catch {
      this.abort(barrier.documentId, barrier.id);
    }
  }

  private claimCompletion(barrier: CompactionBarrier): void {
    if (!barrier.completion || barrier.phase !== "confirming" || barrier.serverSequence === null
      || barrier.completion.confirmed.size !== barrier.participants.size) return;
    barrier.phase = "committing";
    clearTimeout(barrier.timeout);
    barrier.completion.resolve({ barrierId: barrier.id, serverSequence: barrier.serverSequence });
  }

  private completionAborted() {
    return codedHttpException(HttpStatus.CONFLICT, "MEETING_COMPLETION_RETRY",
      "Meeting changes could not settle. Please retry completion.");
  }

  private release(barrier: CompactionBarrier, outcome: MeetingCompactionReleasedEvent["outcome"]): void {
    clearTimeout(barrier.timeout);
    this.barriers.delete(barrier.documentId);
    if (outcome === "aborted") barrier.completion?.reject(this.completionAborted());
    meetingCollaborationEvents.emit("compaction-released", {
      intention: barrier.intention,
      meetingId: barrier.meetingId,
      documentId: barrier.documentId,
      barrierId: barrier.id,
      participantIds: [...barrier.participants],
      outcome,
    } satisfies MeetingCompactionReleasedEvent);
  }
}
