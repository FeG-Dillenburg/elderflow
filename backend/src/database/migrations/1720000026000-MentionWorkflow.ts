import { MigrationInterface, QueryRunner } from "typeorm";

export class MentionWorkflow1720000026000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "mention_states" (
      "mention_id" uuid PRIMARY KEY REFERENCES "mention_snapshots"("id") ON DELETE RESTRICT,
      "done" boolean NOT NULL DEFAULT false
    )`);
    await runner.query(`CREATE TABLE "mention_comment_operations" (
      "id" uuid PRIMARY KEY REFERENCES "topic_updates"("id") ON DELETE RESTRICT,
      "mention_id" uuid NOT NULL REFERENCES "mention_snapshots"("id") ON DELETE RESTRICT
    )`);
    // Missing state means Open, for both existing and newly captured mentions.
  }

  async down(): Promise<void> {
    throw new Error("Mention workflow is a forward-only migration");
  }
}
