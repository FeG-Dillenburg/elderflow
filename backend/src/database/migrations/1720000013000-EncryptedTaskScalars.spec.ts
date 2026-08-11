import { EncryptedTaskScalars1720000013000 } from './1720000013000-EncryptedTaskScalars';

describe('EncryptedTaskScalars1720000013000', () => {
  it('replaces plaintext Task fields with the canonical envelope and commit-revision columns', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (statement: string) => {
        statements.push(statement.replace(/\s+/g, ' ').trim());
        if (statement.includes('SELECT EXISTS')) {
          return [{ has_protected_task_data: false }];
        }
        return undefined;
      }),
    };

    await new EncryptedTaskScalars1720000013000().up(queryRunner as never);

    const sql = statements.join('\n');
    expect(sql).toContain('DROP COLUMN "title"');
    expect(sql).toContain('DROP COLUMN "description"');
    expect(sql).toContain('ADD COLUMN "title_envelope" bytea NOT NULL');
    expect(sql).toContain('ADD COLUMN "title_commit_revision" bigint NOT NULL DEFAULT 1');
    expect(sql).toContain('ADD COLUMN "description_envelope" bytea NOT NULL');
    expect(sql).toContain('ADD COLUMN "description_commit_revision" bigint NOT NULL DEFAULT 1');
    expect(sql).not.toContain('CREATE TABLE "e2ee_scalar_writes"');
  });

  it('requires disposable plaintext Task data to be reset first', async () => {
    const queryRunner = {
      query: jest.fn(async () => [{ has_protected_task_data: true }]),
    };

    await expect(
      new EncryptedTaskScalars1720000013000().up(queryRunner as never),
    ).rejects.toThrow('E2EE_TASK_RESET_REQUIRED');
  });

  it('never restores plaintext Task storage', async () => {
    await expect(
      new EncryptedTaskScalars1720000013000().down({} as never),
    ).rejects.toThrow('E2EE_TASK_MIGRATION_IRREVERSIBLE');
  });
});
