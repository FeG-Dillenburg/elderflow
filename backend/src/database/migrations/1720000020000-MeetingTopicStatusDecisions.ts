import { MigrationInterface, QueryRunner } from 'typeorm';

export class MeetingTopicStatusDecisions1720000020000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        ADD COLUMN "topic_status_decision" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        ADD CONSTRAINT "CHK_meeting_topic_status_decision"
        CHECK ("topic_status_decision" IS NULL OR "topic_status_decision" IN ('done', 'deferred'))
    `);
  }

  async down(): Promise<void> {
    throw new Error('Meeting topic status decisions are a forward-only migration');
  }
}
