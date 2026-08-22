import { KeyRotationCeremonies1720000018000 } from './1720000018000-KeyRotationCeremonies';

describe('KeyRotationCeremonies1720000018000', () => {
  it('upgrades existing recovery data in place and retains historical Content Key wrappers', async () => {
    const statements: string[] = [];
    const queryRunner = { query: jest.fn(async (sql: string) => statements.push(sql)) } as any;

    await new KeyRotationCeremonies1720000018000().up(queryRunner);

    const migration = statements.join('\n');
    expect(migration).toContain('ALTER TABLE "e2ee_recovery_ceremonies"');
    expect(migration).toContain('ALTER TABLE "e2ee_client_epochs"');
    expect(migration).toContain('"write_grace_until"');
    expect(migration).toContain('"operation"');
    expect(migration).toContain('"candidate_recovery_slot"');
    expect(migration).toContain('"candidate_content_key_wrapper"');
    expect(migration).toContain('CREATE TABLE "e2ee_content_key_wrappers"');
    expect(migration).toContain('INSERT INTO "e2ee_content_key_wrappers"');
    expect(migration).not.toMatch(/TRUNCATE|DROP TABLE "e2ee_key_state"/i);
  });
});
