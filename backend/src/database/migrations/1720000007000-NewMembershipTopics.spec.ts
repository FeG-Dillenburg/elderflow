import { NewMembershipTopics1720000007000 } from './1720000007000-NewMembershipTopics';

describe('New membership Topics migration', () => {
  it('adds typed Topic fields, completed appearance snapshots, and type-aware constraints', async () => {
    const query = jest.fn();

    await new NewMembershipTopics1720000007000().up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ADD COLUMN "membership_process_status" text');
    expect(sql).toContain('ADD COLUMN "membership_status_signal" text');
    expect(sql).toContain('ADD COLUMN "godparents" text');
    expect(sql).toContain('ADD COLUMN "membership_process_status_snapshot" text');
    expect(sql).toContain('ADD COLUMN "membership_status_signal_snapshot" text');
    expect(sql).toContain('ADD COLUMN "godparents_snapshot" text');
    expect(sql).toContain("'new', 'in_progress', 'nearly_finished', 'attention', 'paused'");
    expect(sql).toContain('"type" = \'new_membership\'');
    expect(sql).toContain('"membership_status_signal" IS NOT NULL');
    expect(sql).toContain('"membership_process_status" IS NULL');
    expect(sql).toContain('"meeting"."status" = \'completed\'');
  });
});
