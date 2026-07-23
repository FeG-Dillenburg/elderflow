import { MeetingAppearanceTexts1720000010000 } from './1720000010000-MeetingAppearanceTexts';

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
});
