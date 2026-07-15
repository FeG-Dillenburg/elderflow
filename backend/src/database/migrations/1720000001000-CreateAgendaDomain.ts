import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgendaDomain1720000001000 implements MigrationInterface {
  name = 'CreateAgendaDomain1720000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "role" text NOT NULL DEFAULT 'leadership';

      CREATE TABLE "agenda_sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "position" integer NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false
      );

      CREATE TABLE "topics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "description" text NOT NULL,
        "type" text NOT NULL,
        "status" text NOT NULL DEFAULT 'open',
        "follow_up_date" date,
        "responsible_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "is_recurring" boolean NOT NULL DEFAULT false,
        "default_section_id" uuid REFERENCES "agenda_sections"("id") ON DELETE SET NULL,
        "default_position" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "meetings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text,
        "date" date NOT NULL,
        "begin_time" time NOT NULL,
        "status" text NOT NULL DEFAULT 'planned',
        "meeting_leader_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "minute_taker_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "general_notes" text,
        "opening_input" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "meeting_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "attendance_status" text NOT NULL DEFAULT 'unknown',
        UNIQUE ("meeting_id", "user_id")
      );

      CREATE TABLE "meeting_topics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
        "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
        "section_id" uuid NOT NULL REFERENCES "agenda_sections"("id") ON DELETE RESTRICT,
        "position" integer NOT NULL,
        "agenda_note" text,
        "planned_duration" integer,
        "status" text NOT NULL DEFAULT 'planned',
        UNIQUE ("meeting_id", "topic_id")
      );

      CREATE TABLE "topic_updates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "topic_id" uuid NOT NULL REFERENCES "topics"("id") ON DELETE CASCADE,
        "meeting_id" uuid REFERENCES "meetings"("id") ON DELETE SET NULL,
        "date" timestamptz NOT NULL DEFAULT now(),
        "text" text NOT NULL,
        "type" text NOT NULL DEFAULT 'update',
        "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE "tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "description" text,
        "topic_id" uuid REFERENCES "topics"("id") ON DELETE SET NULL,
        "meeting_id" uuid REFERENCES "meetings"("id") ON DELETE SET NULL,
        "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "due_date" date,
        "status" text NOT NULL DEFAULT 'open',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );

      CREATE INDEX "IDX_topics_follow_up" ON "topics" ("status", "follow_up_date");
      CREATE INDEX "IDX_topic_updates_feed" ON "topic_updates" ("topic_id", "date" DESC);
      CREATE INDEX "IDX_meeting_topics_order" ON "meeting_topics" ("meeting_id", "section_id", "position");
      CREATE INDEX "IDX_tasks_open" ON "tasks" ("status", "due_date");

      INSERT INTO "agenda_sections" ("name", "position", "is_default") VALUES
        ('Opening / Input', 1, true),
        ('Attendance and next meeting', 2, true),
        ('People in special life circumstances', 3, true),
        ('Urgent topics', 4, true),
        ('Strategic topics', 5, true),
        ('Communication to the church', 6, true),
        ('Dates and appointments', 7, true),
        ('Other topics', 8, true);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "tasks";
      DROP TABLE "topic_updates";
      DROP TABLE "meeting_topics";
      DROP TABLE "meeting_users";
      DROP TABLE "meetings";
      DROP TABLE "topics";
      DROP TABLE "agenda_sections";
      ALTER TABLE "users" DROP COLUMN "role";
    `);
  }
}
