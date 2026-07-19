import { Injectable, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import {
  MeetingSnapshotContributor,
  MeetingSnapshotRegistry,
} from '../meetings/meeting-snapshot-contributor';
import { Topic } from './topic.entity';

declare module '../meetings/meeting-snapshot-contributor' {
  interface MeetingTopicTypeSnapshotFields {
    membershipProcessStatusSnapshot: string | null;
    membershipStatusSignalSnapshot: string | null;
    godparentsSnapshot: string | null;
  }
}

type MembershipSnapshotKey =
  | 'membershipProcessStatusSnapshot'
  | 'membershipStatusSignalSnapshot'
  | 'godparentsSnapshot';

@Injectable()
export class NewMembershipSnapshotContributor
  implements MeetingSnapshotContributor<MembershipSnapshotKey>, OnModuleInit {
  readonly keys = [
    'membershipProcessStatusSnapshot',
    'membershipStatusSignalSnapshot',
    'godparentsSnapshot',
  ] as const;

  constructor(private readonly registry: MeetingSnapshotRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  snapshot(
    _appearance: Readonly<MeetingTopic>,
    topic: Readonly<Topic>,
    _manager: EntityManager,
  ) {
    if (topic.type !== 'new_membership') {
      return {
        membershipProcessStatusSnapshot: null,
        membershipStatusSignalSnapshot: null,
        godparentsSnapshot: null,
      };
    }
    return {
      membershipProcessStatusSnapshot: topic.membershipProcessStatus,
      membershipStatusSignalSnapshot: topic.membershipStatusSignal,
      godparentsSnapshot: topic.godparents,
    };
  }
}
