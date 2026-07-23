import { CreateUsers1720000000000 } from './1720000000000-CreateUsers';
import { CreateAgendaDomain1720000001000 } from './1720000001000-CreateAgendaDomain';
import { ArchiveUsers1720000002000 } from './1720000002000-ArchiveUsers';
import { LocalAuthentication1720000003000 } from './1720000003000-LocalAuthentication';
import { Internationalization1720000004000 } from './1720000004000-Internationalization';
import { TopicTypes1720000005000 } from './1720000005000-TopicTypes';
import { MeetingCompletionSnapshots1720000006000 } from './1720000006000-MeetingCompletionSnapshots';
import { NewMembershipTopics1720000007000 } from './1720000007000-NewMembershipTopics';
import { RecurringTopics1720000008000 } from './1720000008000-RecurringTopics';
import { MeetingTopicDeferrals1720000009000 } from './1720000009000-MeetingTopicDeferrals';

export const migrations = [
  CreateUsers1720000000000,
  CreateAgendaDomain1720000001000,
  ArchiveUsers1720000002000,
  LocalAuthentication1720000003000,
  Internationalization1720000004000,
  TopicTypes1720000005000,
  MeetingCompletionSnapshots1720000006000,
  NewMembershipTopics1720000007000,
  RecurringTopics1720000008000,
  MeetingTopicDeferrals1720000009000,
];
