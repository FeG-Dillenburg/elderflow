import { MeetingTopic } from './meeting-topic.entity';
import {
  MeetingSnapshotRegistry,
  MeetingTopicTypeSnapshotFields,
} from './meeting-snapshot-contributor';

declare module './meeting-snapshot-contributor' {
  interface MeetingTopicTypeSnapshotFields {
    membershipProcessStatusSnapshot: string | null;
  }
}

declare module './meeting-topic.entity' {
  interface MeetingTopic {
    membershipProcessStatusSnapshot: string | null;
  }
}

describe('MeetingSnapshotRegistry', () => {
  it('applies only registered, persisted type-specific snapshot keys', async () => {
    const registry = new MeetingSnapshotRegistry();
    const contributor = {
      keys: ['membershipProcessStatusSnapshot'] as const,
      snapshot: jest.fn().mockResolvedValue({
        membershipProcessStatusSnapshot: 'Nearly ready',
      } satisfies Pick<MeetingTopicTypeSnapshotFields, 'membershipProcessStatusSnapshot'>),
    };
    registry.register(contributor);
    const appearance = {} as MeetingTopic;
    const topic = {} as any;
    const manager = {} as any;

    await registry.apply(appearance, topic, manager);

    expect(appearance.membershipProcessStatusSnapshot).toBe('Nearly ready');
    expect(contributor.snapshot).toHaveBeenCalledWith(appearance, topic, manager);
  });
});
