import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { codedHttpException } from "../errors/coded-http.exception";
import {
  meetingCollaborationEvents,
  type MeetingCompactionReleasedEvent,
} from "./meeting-collaboration-events";

type BarrierPhase = "draining" | "ready" | "committing";

interface CompactionBarrier {
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
  private readonly timeoutMs = 5_000;

  open(input: {
    meetingId: string;
    documentId: string;
    compactorConnectionId: string;
    compactorUserId: string;
    participantIds: string[];
  }): OpenCompactionBarrier {
    const existing = this.barriers.get(input.documentId);
    if (existing) {
      return {
        barrierId: existing.id,
        participantIds: [...existing.participants],
      };
    }
    const id = randomUUID();
    const barrier: CompactionBarrier = {
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
    return { barrierId: id, participantIds: [...barrier.participants] };
  }

  join(documentId: string, participantId: string): OpenCompactionBarrier | null {
    const barrier = this.barriers.get(documentId);
    if (!barrier) return null;
    barrier.participants.add(participantId);
    if (barrier.phase !== "committing") {
      barrier.phase = "draining";
      barrier.serverSequence = null;
    }
    return { barrierId: barrier.id, participantIds: [participantId] };
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
      || barrier.phase !== "ready" || !barrier.serverSequence) {
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

  complete(meetingId: string, barrierId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId) return;
    this.release(barrier, "compacted");
  }

  fail(meetingId: string, barrierId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.id === barrierId);
    if (!barrier || barrier.meetingId !== meetingId) return;
    this.release(barrier, "aborted");
  }

  abort(documentId: string, barrierId?: string): void {
    const barrier = this.barriers.get(documentId);
    if (!barrier || (barrierId && barrier.id !== barrierId)) return;
    this.release(barrier, "aborted");
  }

  abortMeeting(meetingId: string): void {
    const barrier = [...this.barriers.values()].find((candidate) => candidate.meetingId === meetingId);
    if (barrier) this.release(barrier, "aborted");
  }

  disconnected(documentId: string, participantId: string): void {
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

  current(documentId: string): OpenCompactionBarrier | null {
    const barrier = this.barriers.get(documentId);
    return barrier ? { barrierId: barrier.id, participantIds: [...barrier.participants] } : null;
  }

  private release(barrier: CompactionBarrier, outcome: MeetingCompactionReleasedEvent["outcome"]): void {
    clearTimeout(barrier.timeout);
    this.barriers.delete(barrier.documentId);
    meetingCollaborationEvents.emit("compaction-released", {
      meetingId: barrier.meetingId,
      documentId: barrier.documentId,
      barrierId: barrier.id,
      participantIds: [...barrier.participants],
      outcome,
    } satisfies MeetingCompactionReleasedEvent);
  }
}
