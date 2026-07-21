import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { MeetingSnapshotRegistry } from '../meetings/meeting-snapshot-contributor';
import { Topic } from './topic.entity';
import { NewMembershipSnapshotContributor } from './new-membership-snapshot.contributor';

describe('NewMembershipSnapshotContributor', () => {
  it('captures membership values through the centralized snapshot registry', async () => {
    const registry = new MeetingSnapshotRegistry();
    new NewMembershipSnapshotContributor(registry).onModuleInit();
    const appearance = {} as MeetingTopic;
    const topic = {
      type: 'new_membership',
      membershipProcessStatus: 'Membership class booked',
      membershipStatusSignal: 'in_progress',
      godparents: 'Taylor and Robin',
    } as Topic;

    await registry.apply(appearance, topic, {} as any);

    expect(appearance).toMatchObject({
      membershipProcessStatusSnapshot: 'Membership class booked',
      membershipStatusSignalSnapshot: 'in_progress',
      godparentsSnapshot: 'Taylor and Robin',
    });
  });

  it('leaves membership snapshots empty for other Topic types', async () => {
    const registry = new MeetingSnapshotRegistry();
    new NewMembershipSnapshotContributor(registry).onModuleInit();
    const appearance = {} as MeetingTopic;

    await registry.apply(appearance, { type: 'person' } as Topic, {} as any);

    expect(appearance).toMatchObject({
      membershipProcessStatusSnapshot: null,
      membershipStatusSignalSnapshot: null,
      godparentsSnapshot: null,
    });
  });
});
