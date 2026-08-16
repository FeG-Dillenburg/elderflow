import { MigrationInterface, QueryRunner } from "typeorm";

export class MeetingCollaboration1720000016000 implements MigrationInterface {
  name = "MeetingCollaboration1720000016000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "meeting_collaboration_tickets" (
        "ticket_hash" bytea PRIMARY KEY CHECK (octet_length("ticket_hash") = 32),
        "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
        "document_id" uuid NOT NULL REFERENCES "meeting_documents"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "session_version" integer NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "meeting_collaboration_tickets_expiry_idx"
      ON "meeting_collaboration_tickets" ("expires_at")
    `);
  }

  async down(): Promise<void> {
    throw new Error("E2EE_COLLABORATION_MIGRATION_IRREVERSIBLE");
  }
}
