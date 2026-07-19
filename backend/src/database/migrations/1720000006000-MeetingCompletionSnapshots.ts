import { MigrationInterface, QueryRunner } from 'typeorm';

export class MeetingCompletionSnapshots1720000006000 implements MigrationInterface {
  name = 'MeetingCompletionSnapshots1720000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        ADD COLUMN "topic_name_snapshot" text,
        ADD COLUMN "responsible_user_display_name_snapshot" text;

      UPDATE "meeting_topics" AS "appearance"
      SET
        "topic_name_snapshot" = "topic"."name",
        "responsible_user_display_name_snapshot" = (
          SELECT NULLIF(CONCAT_WS(' ', "user"."first_name", "user"."last_name"), '')
          FROM "users" AS "user"
          WHERE "user"."id" = "topic"."responsible_user_id"
        )
      FROM "topics" AS "topic", "meetings" AS "meeting"
      WHERE "appearance"."topic_id" = "topic"."id"
        AND "appearance"."meeting_id" = "meeting"."id"
        AND "meeting"."status" = 'completed';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "responsible_user_display_name_snapshot",
        DROP COLUMN "topic_name_snapshot";
    `);
  }
}
