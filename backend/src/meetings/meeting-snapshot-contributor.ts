import { EntityManager } from 'typeorm';
import { MeetingTopic } from './meeting-topic.entity';
import { Topic } from '../topics/topic.entity';

export const MEETING_SNAPSHOT_CONTRIBUTORS = Symbol('MEETING_SNAPSHOT_CONTRIBUTORS');

/**
 * Type-specific Topic modules can add snapshot values without taking ownership
 * of the Meeting completion transaction.
 */
export interface MeetingTopicTypeSnapshot {}

export interface MeetingSnapshotContributor {
  snapshot(
    appearance: Readonly<MeetingTopic>,
    topic: Readonly<Topic>,
    manager: EntityManager,
  ): Promise<MeetingTopicTypeSnapshot> | MeetingTopicTypeSnapshot;
}
