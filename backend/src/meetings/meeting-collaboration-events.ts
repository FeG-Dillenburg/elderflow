import { EventEmitter } from "node:events";

export const meetingCollaborationEvents = new EventEmitter();

export interface MeetingCompletedEvent {
  meetingId: string;
}

export interface MeetingCompactedEvent {
  meetingId: string;
}
