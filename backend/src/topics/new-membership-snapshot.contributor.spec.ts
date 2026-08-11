import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { MeetingSnapshotRegistry } from '../meetings/meeting-snapshot-contributor';
import { Topic } from './topic.entity';
import { NewMembershipSnapshotContributor } from './new-membership-snapshot.contributor';

describe('NewMembershipSnapshotContributor', () => {
  it('copies only the structural membership signal', async () => {
    const registry = new MeetingSnapshotRegistry();
    new NewMembershipSnapshotContributor(registry).onModuleInit();
    const appearance = {} as MeetingTopic;
    const topic = {
      type: 'new_membership',
      membershipStatusSignal: 'in_progress',
    } as unknown as Topic;

    await registry.apply(appearance, topic, {} as any);

    expect(appearance).toMatchObject({
      membershipStatusSignalSnapshot: 'in_progress',
    });
  });

  it('leaves membership snapshots empty for other Topic types', async () => {
    const registry = new MeetingSnapshotRegistry();
    new NewMembershipSnapshotContributor(registry).onModuleInit();
    const appearance = {} as MeetingTopic;

    await registry.apply(appearance, { type: 'person' } as Topic, {} as any);

    expect(appearance).toMatchObject({
      membershipStatusSignalSnapshot: null,
    });
  });
});
