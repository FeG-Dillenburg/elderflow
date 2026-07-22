import { MeetingTopicDeferrals1720000009000 } from './1720000009000-MeetingTopicDeferrals';

describe('Meeting Topic deferrals migration', () => {
  it('adds a nullable timestamp to Meeting appearances', async () => {
    const query = jest.fn();

    await new MeetingTopicDeferrals1720000009000().up({ query } as any);

    expect(query.mock.calls.map(([statement]) => statement).join('\n'))
      .toContain('ADD COLUMN "deferred_at" timestamptz');
  });
});
