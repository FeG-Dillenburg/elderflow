import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewMembershipTopics1720000007000 implements MigrationInterface {
  name = 'NewMembershipTopics1720000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topics"
        ADD COLUMN "membership_process_status" text,
        ADD COLUMN "membership_status_signal" text,
        ADD COLUMN "godparents" text;

      UPDATE "topics"
      SET "membership_status_signal" = 'new'
      WHERE "type" = 'new_membership';

      ALTER TABLE "topics"
        ADD CONSTRAINT "CHK_topics_new_membership_fields" CHECK (
          (
            "type" = 'new_membership'
            AND "membership_status_signal" IS NOT NULL
            AND "membership_status_signal" IN ('new', 'in_progress', 'nearly_finished', 'attention', 'paused')
          )
          OR
          (
            "type" <> 'new_membership'
            AND "membership_process_status" IS NULL
            AND "membership_status_signal" IS NULL
            AND "godparents" IS NULL
          )
        );

      ALTER TABLE "meeting_topics"
        ADD COLUMN "membership_process_status_snapshot" text,
        ADD COLUMN "membership_status_signal_snapshot" text,
        ADD COLUMN "godparents_snapshot" text;

      UPDATE "meeting_topics" AS "appearance"
      SET
        "membership_process_status_snapshot" = "topic"."membership_process_status",
        "membership_status_signal_snapshot" = "topic"."membership_status_signal",
        "godparents_snapshot" = "topic"."godparents"
      FROM "topics" AS "topic", "meetings" AS "meeting"
      WHERE "appearance"."topic_id" = "topic"."id"
        AND "appearance"."meeting_id" = "meeting"."id"
        AND "topic"."type" = 'new_membership'
        AND "meeting"."status" = 'completed';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "godparents_snapshot",
        DROP COLUMN "membership_status_signal_snapshot",
        DROP COLUMN "membership_process_status_snapshot";

      ALTER TABLE "topics"
        DROP CONSTRAINT "CHK_topics_new_membership_fields",
        DROP COLUMN "godparents",
        DROP COLUMN "membership_status_signal",
        DROP COLUMN "membership_process_status";
    `);
  }
}
