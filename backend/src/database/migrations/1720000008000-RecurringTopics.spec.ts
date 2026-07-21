import { RecurringTopics1720000008000 } from './1720000008000-RecurringTopics';

describe('Recurring Topics migration', () => {
  it('adds typed recurrence state, appearance provenance, edit state, and durable unique skips', async () => {
    const query = jest.fn();
    await new RecurringTopics1720000008000().up({ query } as any);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('"recurrence_first_due_date" date');
    expect(sql).toContain('"recurrence_interval" > 0');
    expect(sql).toContain("\"recurrence_unit\" IN ('weeks', 'months')");
    expect(sql).toContain('DROP COLUMN "is_recurring"');
    expect(sql).toContain('"source" text NOT NULL DEFAULT \'manual\'');
    expect(sql).toContain('"note_edited_at" timestamptz');
    expect(sql).toContain('UNIQUE ("topic_id", "meeting_id")');
  });
});
