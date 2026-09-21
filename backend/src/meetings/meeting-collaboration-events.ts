import { EventEmitter } from "node:events";

export const meetingCollaborationEvents = new EventEmitter();

export interface MeetingCompletedEvent {
  meetingId: string;
}

export interface MeetingCompactionReleasedEvent {
  intention?: "compaction" | "completion";
  meetingId: string;
  documentId: string;
  barrierId: string;
  participantIds: string[];
  outcome: "compacted" | "completed" | "aborted";
}
