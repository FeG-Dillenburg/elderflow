import { MigrationInterface, QueryRunner } from 'typeorm';

export class MeetingAppearanceTexts1720000010000 implements MigrationInterface {
  name = 'MeetingAppearanceTexts1720000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        ADD COLUMN "note_version" integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE "topic_updates"
        ADD COLUMN "version" integer NOT NULL DEFAULT 0;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topic_updates"
        DROP COLUMN "version";
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "note_version";
    `);
  }
}
