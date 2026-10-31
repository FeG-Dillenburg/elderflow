import { newDb } from 'pg-mem';
import { AgendaSectionDefaults1720000025000 } from './1720000025000-AgendaSectionDefaults';

describe('Agenda section defaults upgrade', () => {
  it('preserves sections and references, starts unmapped, and constrains assignments', async () => {
    const db = newDb();
    db.public.none(`
      CREATE TABLE agenda_sections (id text PRIMARY KEY, name text, position integer, is_default boolean);
      CREATE TABLE topics (id text PRIMARY KEY, default_section_id text REFERENCES agenda_sections(id));
      CREATE TABLE meeting_topics (id text PRIMARY KEY, section_id text REFERENCES agenda_sections(id));
      INSERT INTO agenda_sections VALUES ('a', 'Opening', 2, true), ('b', 'Discussion', 5, false);
      INSERT INTO topics VALUES ('topic', 'a');
      INSERT INTO meeting_topics VALUES ('appearance', 'b');
    `);
    await new AgendaSectionDefaults1720000025000().up({ query: async (sql: string) => db.public.none(sql) } as any);
    expect(db.public.many('SELECT * FROM agenda_sections ORDER BY id')).toEqual([
      { id: 'a', name: 'Opening', position: 2, default_topic_type: null },
      { id: 'b', name: 'Discussion', position: 5, default_topic_type: null },
    ]);
    expect(db.public.one('SELECT * FROM topics')).toMatchObject({ default_section_id: 'a' });
    expect(db.public.one('SELECT * FROM meeting_topics')).toMatchObject({ section_id: 'b' });
    expect(() => db.public.none("UPDATE agenda_sections SET default_topic_type = 'invalid' WHERE id = 'a'")).toThrow();
    db.public.none("UPDATE agenda_sections SET default_topic_type = 'person' WHERE id = 'a'");
    expect(() => db.public.none("UPDATE agenda_sections SET default_topic_type = 'person' WHERE id = 'b'")).toThrow();
  });
});
