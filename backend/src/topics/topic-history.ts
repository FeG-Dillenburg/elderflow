import { MembershipStatusSignal, TopicType } from './topic.entity';

export interface TopicHistoryMeeting {
  id: string;
  protected: { titleEnvelope: string; titleCommitRevision: string } | null;
  date: string;
  beginTime: string;
  status: string;
  completedAt: string | null;
  minuteTakerDisplayName: string | null;
}

export interface TopicHistoryTopicDisplay {
  id: string;
  type: TopicType;
  responsibleUserDisplayName: string | null;
  membershipStatusSignal: MembershipStatusSignal | null;
  protected: {
    nameEnvelope: string;
    nameCommitRevision: string;
    membershipProcessStatusEnvelope: string;
    membershipProcessStatusCommitRevision: string;
    godparentsEnvelope: string;
    godparentsCommitRevision: string;
  } | null;
  protectedUnavailable: boolean;
}

export interface StandaloneUpdateHistoryEntry {
  id: string;
  kind: 'standalone_update';
  effectiveAt: string;
  updateId: string;
  createdByDisplayName: string | null;
  protected: { textEnvelope: string; textCommitRevision: string } | null;
}

export interface MeetingAppearanceHistoryEntry {
  id: string;
  kind: 'meeting_appearance';
  effectiveAt: string;
  appearanceId: string | null;
  deferredAt: string | null;
  meeting: TopicHistoryMeeting;
  section: { id: string; name: string } | null;
  topic: TopicHistoryTopicDisplay;
  meetingDocument: { meetingId: string; appearanceId: string | null };
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
