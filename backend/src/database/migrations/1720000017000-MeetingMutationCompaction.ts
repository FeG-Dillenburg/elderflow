import { MigrationInterface, QueryRunner } from "typeorm";

export class MeetingMutationCompaction1720000017000 implements MigrationInterface {
  name = "MeetingMutationCompaction1720000017000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_document_mutations"
        DROP CONSTRAINT "meeting_document_mutations_update_id_fkey"
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_document_mutations"
        ALTER COLUMN "update_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_document_mutations"
        ADD CONSTRAINT "meeting_document_mutations_update_id_fkey"
        FOREIGN KEY ("update_id") REFERENCES "meeting_document_updates"("id")
        ON DELETE SET NULL
    `);
  }

  async down(): Promise<void> {
    throw new Error("E2EE_MEETING_MUTATION_COMPACTION_MIGRATION_IRREVERSIBLE");
  }
}
