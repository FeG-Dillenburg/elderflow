import { MigrationInterface, QueryRunner } from 'typeorm';

export class MeetingTopicDeferrals1720000009000 implements MigrationInterface {
  name = 'MeetingTopicDeferrals1720000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        ADD COLUMN "deferred_at" timestamptz;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "deferred_at";
    `);
  }
}
