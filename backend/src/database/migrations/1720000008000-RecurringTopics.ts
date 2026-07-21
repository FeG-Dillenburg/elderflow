import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecurringTopics1720000008000 implements MigrationInterface {
  name = 'RecurringTopics1720000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topics"
        ADD COLUMN "recurrence_first_due_date" date,
        ADD COLUMN "recurrence_interval" integer,
        ADD COLUMN "recurrence_unit" text;

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "topics" WHERE "type" = 'recurring') THEN
          RAISE EXCEPTION 'Reset the development database before migrating legacy recurring Topics';
        END IF;
      END $$;

      ALTER TABLE "topics"
        DROP COLUMN "is_recurring",
        ADD CONSTRAINT "CHK_topics_recurrence_fields" CHECK (
          (
            "type" = 'recurring'
            AND "recurrence_first_due_date" IS NOT NULL
            AND "recurrence_interval" > 0
            AND "recurrence_unit" IN ('weeks', 'months')
            AND "default_section_id" IS NOT NULL
            AND "follow_up_date" IS NULL
          )
          OR
          (
            "type" <> 'recurring'
            AND "recurrence_first_due_date" IS NULL
            AND "recurrence_interval" IS NULL
            AND "recurrence_unit" IS NULL
          )
        ),
        ADD CONSTRAINT "CHK_topics_default_position_positive" CHECK (
          "default_position" IS NULL OR "default_position" > 0
        );

      ALTER TABLE "meeting_topics"
        ADD COLUMN "source" text NOT NULL DEFAULT 'manual',
        ADD COLUMN "note_edited_at" timestamptz,
        ADD CONSTRAINT "CHK_meeting_topics_source" CHECK ("source" IN ('manual', 'recurrence'));

      CREATE TABLE "skipped_recurrences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "topic_id" uuid NOT NULL,
        "meeting_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skipped_recurrences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_skipped_recurrences_topic_meeting" UNIQUE ("topic_id", "meeting_id"),
        CONSTRAINT "FK_skipped_recurrences_topic" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_skipped_recurrences_meeting" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "skipped_recurrences";
      ALTER TABLE "meeting_topics"
        DROP CONSTRAINT "CHK_meeting_topics_source",
        DROP COLUMN "note_edited_at",
        DROP COLUMN "source";
      ALTER TABLE "topics"
        DROP CONSTRAINT "CHK_topics_default_position_positive",
        DROP CONSTRAINT "CHK_topics_recurrence_fields",
        ADD COLUMN "is_recurring" boolean NOT NULL DEFAULT false,
        DROP COLUMN "recurrence_unit",
        DROP COLUMN "recurrence_interval",
        DROP COLUMN "recurrence_first_due_date";
    `);
  }
}
