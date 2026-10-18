import { MigrationInterface, QueryRunner } from 'typeorm';

export class TourProgress1720000023000 implements MigrationInterface {
  name = 'TourProgress1720000023000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tour_progress" (
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "tour_id" text NOT NULL,
        "version" integer NOT NULL CHECK ("version" > 0),
        "state" text NOT NULL CHECK ("state" IN ('unseen', 'started', 'skipped', 'completed')),
        "last_step_id" text,
        "attempts" integer NOT NULL DEFAULT 0,
        "first_started_at" timestamptz,
        "last_started_at" timestamptz,
        "last_skipped_at" timestamptz,
        "completed_at" timestamptz,
        PRIMARY KEY ("user_id", "tour_id", "version")
      )
    `);
  }

  async down(): Promise<void> {
    throw new Error('Tour progress is a forward-only migration');
  }
}
