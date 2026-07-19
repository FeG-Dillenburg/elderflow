import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Topic } from '../topics/topic.entity';
import { MeetingTopic } from './meeting-topic.entity';

/**
 * Topic-type modules extend this interface with their persisted snapshot
 * columns. Registration only accepts keys that also exist on MeetingTopic.
 */
export interface MeetingTopicTypeSnapshotFields {}

export type MeetingTopicTypeSnapshotKey = Extract<
  keyof MeetingTopicTypeSnapshotFields,
  keyof MeetingTopic
>;

export interface MeetingSnapshotContributor<Key extends MeetingTopicTypeSnapshotKey> {
  readonly keys: readonly Key[];
  snapshot(
    appearance: Readonly<MeetingTopic>,
    topic: Readonly<Topic>,
    manager: EntityManager,
  ): Promise<Pick<MeetingTopicTypeSnapshotFields, Key>> | Pick<MeetingTopicTypeSnapshotFields, Key>;
}

@Injectable()
export class MeetingSnapshotRegistry {
  private readonly contributors: MeetingSnapshotContributor<MeetingTopicTypeSnapshotKey>[] = [];

  register<Key extends MeetingTopicTypeSnapshotKey>(contributor: MeetingSnapshotContributor<Key>): void {
    this.contributors.push(
      contributor as unknown as MeetingSnapshotContributor<MeetingTopicTypeSnapshotKey>,
    );
  }

  async apply(appearance: MeetingTopic, topic: Topic, manager: EntityManager): Promise<void> {
    for (const contributor of this.contributors) {
      const values = await contributor.snapshot(appearance, topic, manager);
      for (const key of contributor.keys) {
        appearance[key] = values[key] as MeetingTopic[typeof key];
      }
    }
  }
}
