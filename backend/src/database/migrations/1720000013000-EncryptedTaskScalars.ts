import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptedTaskScalars1720000013000 implements MigrationInterface {
  name = 'EncryptedTaskScalars1720000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "tasks"
      ) AS "has_protected_task_data"
    `);
    if (existing?.[0]?.has_protected_task_data === true) {
      throw new Error(
        'E2EE_TASK_RESET_REQUIRED: reset the disposable pre-E2EE Task data before this migration',
      );
    }
    await queryRunner.query(`
      ALTER TABLE "tasks"
        DROP COLUMN "title",
        DROP COLUMN "description",
        ADD COLUMN "title_envelope" bytea NOT NULL,
        ADD COLUMN "title_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("title_commit_revision" > 0),
        ADD COLUMN "description_envelope" bytea NOT NULL,
        ADD COLUMN "description_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("description_commit_revision" > 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    throw new Error(
      'E2EE_TASK_MIGRATION_IRREVERSIBLE: plaintext Task storage must not be restored',
    );
  }
}
