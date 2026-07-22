import { MembershipStatusSignal, TopicType } from './topic.entity';

export interface TopicHistoryMeeting {
  id: string;
  title: string | null;
  date: string;
  beginTime: string;
  status: string;
}

export interface TopicHistoryTopicDisplay {
  type: TopicType;
  name: string | null;
  responsibleUserDisplayName: string | null;
  membershipProcessStatus: string | null;
  membershipStatusSignal: MembershipStatusSignal | null;
  godparents: string | null;
}

export interface TopicHistoryMinutesEntry {
  id: string;
  effectiveAt: string;
  text: string;
  createdByDisplayName: string | null;
}

export interface StandaloneUpdateHistoryEntry {
  id: string;
  kind: 'standalone_update';
  effectiveAt: string;
  updateId: string;
  text: string;
  createdByDisplayName: string | null;
}

export interface MeetingAppearanceHistoryEntry {
  id: string;
  kind: 'meeting_appearance';
  effectiveAt: string;
  appearanceId: string | null;
  meeting: TopicHistoryMeeting;
  section: { id: string; name: string } | null;
  topic: TopicHistoryTopicDisplay;
  note: string | null;
  minutes: TopicHistoryMinutesEntry[];
}

export interface SkippedRecurrenceHistoryEntry {
  id: string;
  kind: 'skipped_recurrence';
  effectiveAt: string;
  skippedRecurrenceId: string;
  meeting: TopicHistoryMeeting;
}

export type TopicHistoryEntry =
  | StandaloneUpdateHistoryEntry
  | MeetingAppearanceHistoryEntry
  | SkippedRecurrenceHistoryEntry;
