import { MeetingTopic } from './meeting-topic.entity';
import {
  MeetingSnapshotRegistry,
  MeetingTopicTypeSnapshotFields,
} from './meeting-snapshot-contributor';

declare module './meeting-snapshot-contributor' {
  interface MeetingTopicTypeSnapshotFields {
    membershipStatusSignalSnapshot: string | null;
  }
}

describe('MeetingSnapshotRegistry', () => {
  it('applies only registered, persisted type-specific snapshot keys', async () => {
    const registry = new MeetingSnapshotRegistry();
    const contributor = {
      keys: ['membershipStatusSignalSnapshot'] as const,
      snapshot: jest.fn().mockResolvedValue({
        membershipStatusSignalSnapshot: 'nearly_finished',
      } satisfies Pick<MeetingTopicTypeSnapshotFields, 'membershipStatusSignalSnapshot'>),
    };
    registry.register(contributor);
    const appearance = {} as MeetingTopic;
    const topic = {} as any;
    const manager = {} as any;

    await registry.apply(appearance, topic, manager);

    expect(appearance.membershipStatusSignalSnapshot).toBe('nearly_finished');
    expect(contributor.snapshot).toHaveBeenCalledWith(appearance, topic, manager);
  });
});
