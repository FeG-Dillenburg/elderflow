import { MigrationInterface, QueryRunner } from "typeorm";

export class EncryptedMeetingWorkspaces1720000014000 implements MigrationInterface {
  name = "EncryptedMeetingWorkspaces1720000014000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "meetings"
        UNION ALL SELECT 1 FROM "meeting_topics"
        UNION ALL SELECT 1 FROM "topic_updates" WHERE "meeting_id" IS NOT NULL
      ) AS "has_protected_meeting_data"
    `);
    if (existing?.[0]?.has_protected_meeting_data === true) {
      throw new Error(
        "E2EE_MEETING_RESET_REQUIRED: reset disposable pre-E2EE Meeting data before this migration",
      );
    }
    await queryRunner.query(`
      ALTER TABLE "meetings"
        DROP COLUMN "title",
        DROP COLUMN "general_notes",
        DROP COLUMN "opening_input",
        ADD COLUMN "title_envelope" bytea NOT NULL,
        ADD COLUMN "title_commit_revision" bigint NOT NULL DEFAULT 1
          CHECK ("title_commit_revision" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "agenda_note",
        DROP COLUMN "note_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        RENAME COLUMN "note_edited_at" TO "content_edited_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "topic_updates"
        DROP COLUMN "meeting_text",
        DROP COLUMN "meeting_id"
    `);
    await queryRunner.query(`
      CREATE TABLE "meeting_documents" (
        "id" uuid PRIMARY KEY,
        "meeting_id" uuid NOT NULL UNIQUE REFERENCES "meetings"("id") ON DELETE CASCADE,
        "envelope_format" integer NOT NULL DEFAULT 1 CHECK ("envelope_format" = 1),
        "crypto_suite" integer NOT NULL DEFAULT 1 CHECK ("crypto_suite" = 1),
        "meeting_codec" integer NOT NULL DEFAULT 2 CHECK ("meeting_codec" = 2),
        "active_snapshot_id" uuid,
        "current_server_sequence" bigint NOT NULL DEFAULT 0 CHECK ("current_server_sequence" >= 0),
        "completed_server_sequence" bigint CHECK ("completed_server_sequence" >= 0),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "meeting_document_snapshots" (
        "id" uuid PRIMARY KEY,
        "document_id" uuid NOT NULL REFERENCES "meeting_documents"("id") ON DELETE CASCADE,
        "parent_snapshot_id" uuid,
        "parent_envelope_hash" bytea NOT NULL CHECK (octet_length("parent_envelope_hash") = 32),
        "covered_server_sequence" bigint NOT NULL CHECK ("covered_server_sequence" >= 0),
        "covered_author_clocks" jsonb NOT NULL,
        "ock_id" uuid NOT NULL,
        "meeting_codec" integer NOT NULL CHECK ("meeting_codec" = 2),
        "client_epoch_id" uuid NOT NULL REFERENCES "e2ee_client_epochs"("id"),
        "snapshot_clock" bigint NOT NULL CHECK ("snapshot_clock" > 0),
        "envelope" bytea NOT NULL CHECK (octet_length("envelope") <= 16800000),
        "envelope_fingerprint" bytea NOT NULL UNIQUE CHECK (octet_length("envelope_fingerprint") = 32),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("document_id", "client_epoch_id", "snapshot_clock")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_documents"
        ADD CONSTRAINT "meeting_documents_active_snapshot_fk"
        FOREIGN KEY ("active_snapshot_id") REFERENCES "meeting_document_snapshots"("id")
    `);
    await queryRunner.query(`
      CREATE TABLE "meeting_document_updates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL REFERENCES "meeting_documents"("id") ON DELETE CASCADE,
        "snapshot_id" uuid NOT NULL REFERENCES "meeting_document_snapshots"("id"),
        "ock_id" uuid NOT NULL,
        "meeting_codec" integer NOT NULL CHECK ("meeting_codec" = 2),
        "client_epoch_id" uuid NOT NULL REFERENCES "e2ee_client_epochs"("id"),
        "author_clock" bigint NOT NULL CHECK ("author_clock" > 0),
        "server_sequence" bigint NOT NULL CHECK ("server_sequence" > 0),
        "envelope" bytea NOT NULL CHECK (octet_length("envelope") <= 1050000),
        "envelope_fingerprint" bytea NOT NULL UNIQUE CHECK (octet_length("envelope_fingerprint") = 32),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("document_id", "client_epoch_id", "author_clock"),
        UNIQUE ("document_id", "server_sequence")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "meeting_document_mutations" (
        "id" uuid PRIMARY KEY,
        "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
        "appearance_id" uuid NOT NULL,
        "source_appearance_id" uuid,
        "update_id" uuid NOT NULL REFERENCES "meeting_document_updates"("id"),
        "request_fingerprint" bytea NOT NULL CHECK (octet_length("request_fingerprint") = 32),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    throw new Error(
      "E2EE_MEETING_MIGRATION_IRREVERSIBLE: plaintext Meeting storage must not be restored",
    );
  }
}
