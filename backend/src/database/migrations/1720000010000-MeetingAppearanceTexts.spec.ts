import { MeetingAppearanceTexts1720000010000 } from './1720000010000-MeetingAppearanceTexts';
import { newDb } from 'pg-mem';

describe('Meeting appearance texts migration', () => {
  it('adds optimistic versions without rewriting existing notes or Minutes entries', async () => {
    const query = jest.fn();

    await new MeetingAppearanceTexts1720000010000().up({ query } as any);

    const statements = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(statements).toContain('ADD COLUMN "note_version" integer NOT NULL DEFAULT 0');
    expect(statements).toContain('ADD COLUMN "version" integer NOT NULL DEFAULT 0');
    expect(statements).not.toMatch(/\bUPDATE\b/i);
    expect(statements).not.toMatch(/\bDELETE\b/i);
  });

  it('preserves seeded appearance notes and single or multiple linked Minutes in order', async () => {
    const database = newDb();
    database.public.none(`
      CREATE TABLE meeting_topics (
        id text PRIMARY KEY,
        agenda_note text
      );
      CREATE TABLE topic_updates (
        id text PRIMARY KEY,
        meeting_id text,
        text text NOT NULL,
        date integer NOT NULL
      );
      INSERT INTO meeting_topics (id, agenda_note) VALUES
        ('appearance-a', '<p>First context</p>'),
        ('appearance-b', '<p>Second context</p>');
      INSERT INTO topic_updates (id, meeting_id, text, date) VALUES
        ('single', 'meeting-a', '<p>Only Minutes</p>', 1),
        ('early', 'meeting-b', '<p>Earlier Minutes</p>', 2),
        ('late', 'meeting-b', '<p>Current Minutes</p>', 3);
    `);
    const query = async (statement: string) => database.public.none(statement);

    await new MeetingAppearanceTexts1720000010000().up({ query } as any);

    expect(database.public.many(`
      SELECT id, agenda_note, note_version
      FROM meeting_topics
      ORDER BY id
    `)).toEqual([
      { id: 'appearance-a', agenda_note: '<p>First context</p>', note_version: 0 },
      { id: 'appearance-b', agenda_note: '<p>Second context</p>', note_version: 0 },
    ]);
    expect(database.public.many(`
      SELECT id, meeting_id, text, date, version
      FROM topic_updates
      ORDER BY date
    `)).toEqual([
      { id: 'single', meeting_id: 'meeting-a', text: '<p>Only Minutes</p>', date: 1, version: 0 },
      { id: 'early', meeting_id: 'meeting-b', text: '<p>Earlier Minutes</p>', date: 2, version: 0 },
      { id: 'late', meeting_id: 'meeting-b', text: '<p>Current Minutes</p>', date: 3, version: 0 },
    ]);
  });
});
