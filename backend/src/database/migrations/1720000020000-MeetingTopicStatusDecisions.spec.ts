import { newDb } from 'pg-mem';
import { MeetingTopicStatusDecisions1720000020000 } from './1720000020000-MeetingTopicStatusDecisions';

describe('Meeting topic status decisions upgrade', () => {
  it('preserves existing appearances without inferring pending decisions', async () => {
    const database = newDb();
    database.public.none(`
      CREATE TABLE meeting_topics (id text PRIMARY KEY, status text, deferred_at timestamptz, position integer, planned_duration integer);
      INSERT INTO meeting_topics VALUES
        ('done', 'done', null, 1, 15),
        ('postponed', 'planned', '2026-07-01T12:00:00Z', 2, 1);
    `);
    const before = database.public.many('SELECT * FROM meeting_topics ORDER BY id');
    await new MeetingTopicStatusDecisions1720000020000().up({
      query: async (sql: string) => database.public.none(sql),
    } as any);
    expect(database.public.many('SELECT * FROM meeting_topics ORDER BY id')).toEqual(
      before.map((row) => ({ ...row, topic_status_decision: null })),
    );
    expect(() => database.public.none("UPDATE meeting_topics SET topic_status_decision = 'open'"))
      .toThrow();
  });
});
