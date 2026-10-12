import { MigrationInterface, QueryRunner } from "typeorm";

export class MentionSnapshots1720000021000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "meeting_topics" ADD COLUMN "mentions_captured" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE TABLE "mention_snapshots" (
      "id" uuid PRIMARY KEY,
      "appearance_id" uuid NOT NULL REFERENCES "meeting_topics"("id") ON DELETE RESTRICT,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "occurrence" integer NOT NULL CHECK ("occurrence" >= 0),
      "context_envelope" bytea NOT NULL,
      UNIQUE ("appearance_id", "user_id", "occurrence")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_mention_snapshots_user" ON "mention_snapshots" ("user_id")`);
  }
  async down(): Promise<void> {
    throw new Error("Mention snapshots are a forward-only migration");
  }
}
