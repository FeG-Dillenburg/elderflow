import { ExternalAuthentication1720000019000 } from './1720000019000-ExternalAuthentication';

describe('ExternalAuthentication1720000019000', () => {
  it('adds External login state without replacing existing User or installation data', async () => {
    const statements: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => statements.push(sql)) } as any;

    await new ExternalAuthentication1720000019000().up(queryRunner);

    const migration = statements.join('\n');
    expect(migration).toContain('CREATE TABLE "external_auth_providers"');
    expect(migration).toContain('CREATE TABLE "external_identities"');
    expect(migration).toContain('CREATE TABLE "external_login_transactions"');
    expect(migration).toContain('WHERE "removed_at" IS NULL');
    expect(migration).toContain('REFERENCES "users" ("id")');
    expect(migration).not.toMatch(/TRUNCATE|DROP TABLE "users"|DELETE FROM "users"/i);
  });
});
