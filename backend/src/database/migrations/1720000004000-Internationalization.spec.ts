import { Internationalization1720000004000 } from './1720000004000-Internationalization';

describe('Internationalization migration', () => {
  it('adds constrained language persistence and configures only existing installations', async () => {
    const query = jest.fn();

    await new Internationalization1720000004000().up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ADD COLUMN "language" text');
    expect(sql).toContain("CHECK (\"language\" IN ('en', 'de'))");
    expect(sql).toContain('CREATE TABLE "installation_settings"');
    expect(sql).toContain('"default_language" text NOT NULL');
    expect(sql).toContain("CHECK (\"default_language\" IN ('en', 'de'))");
    expect(sql).toContain("SELECT 1, 'en' WHERE EXISTS (SELECT 1 FROM \"users\")");
  });
});
