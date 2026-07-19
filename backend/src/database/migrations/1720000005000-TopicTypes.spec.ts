import { TopicTypes1720000005000 } from './1720000005000-TopicTypes';

describe('Topic types migration', () => {
  it('maps every legacy value with recurring precedence and constrains canonical values', async () => {
    const query = jest.fn();

    await new TopicTypes1720000005000().up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER COLUMN "description" DROP NOT NULL');
    expect(sql).toContain("WHEN \"type\" = 'recurring_agenda' OR \"is_recurring\" = true THEN 'recurring'");
    expect(sql).toContain("WHEN \"type\" = 'person_related' THEN 'person'");
    expect(sql).toContain("ELSE 'generic'");
    expect(sql).toContain("CHECK (\"type\" IN ('generic', 'person', 'new_membership', 'recurring'))");
  });
});
