import { MeetingCompletionSnapshots1720000006000 } from './1720000006000-MeetingCompletionSnapshots';

describe('Meeting completion snapshots migration', () => {
  it('adds common appearance snapshots and backfills existing completed Meetings', async () => {
    const query = jest.fn();

    await new MeetingCompletionSnapshots1720000006000().up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ADD COLUMN "topic_name_snapshot" text');
    expect(sql).toContain('ADD COLUMN "responsible_user_display_name_snapshot" text');
    expect(sql).toContain('"meeting"."status" = \'completed\'');
    expect(sql).toContain('CONCAT_WS');
  });
});
