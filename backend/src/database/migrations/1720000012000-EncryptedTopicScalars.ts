import { MigrationInterface, QueryRunner } from "typeorm";

export class EncryptedTopicScalars1720000012000 implements MigrationInterface {
  name = "EncryptedTopicScalars1720000012000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM "topics"
      ) AS "has_protected_topic_data"
    `);
    if (existing?.[0]?.has_protected_topic_data === true) {
      throw new Error(
        "E2EE_TOPIC_RESET_REQUIRED: reset the disposable pre-E2EE Topic data before this migration",
      );
    }
    await queryRunner.query(`
      ALTER TABLE "topics"
        DROP COLUMN "name",
        DROP COLUMN "description",
        DROP COLUMN "membership_process_status",
        DROP COLUMN "godparents",
        ADD COLUMN "name_envelope" bytea NOT NULL,
        ADD COLUMN "name_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("name_commit_revision" > 0),
        ADD COLUMN "description_envelope" bytea NOT NULL,
        ADD COLUMN "description_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("description_commit_revision" > 0),
        ADD COLUMN "membership_process_status_envelope" bytea NOT NULL,
        ADD COLUMN "membership_process_status_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("membership_process_status_commit_revision" > 0),
        ADD COLUMN "godparents_envelope" bytea NOT NULL,
        ADD COLUMN "godparents_commit_revision" bigint NOT NULL DEFAULT 1 CHECK ("godparents_commit_revision" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "topic_updates"
        DROP COLUMN "text",
        ADD COLUMN "text_envelope" bytea,
        ADD COLUMN "text_commit_revision" bigint CHECK ("text_commit_revision" > 0),
        ADD COLUMN "meeting_text" text
    `);
    await queryRunner.query(`
      ALTER TABLE "meeting_topics"
        DROP COLUMN "topic_name_snapshot",
        DROP COLUMN "membership_process_status_snapshot",
        DROP COLUMN "godparents_snapshot",
        ADD COLUMN "topic_name_snapshot_envelope" bytea,
        ADD COLUMN "topic_name_snapshot_commit_revision" bigint CHECK ("topic_name_snapshot_commit_revision" > 0),
        ADD COLUMN "membership_process_status_snapshot_envelope" bytea,
        ADD COLUMN "membership_process_status_snapshot_commit_revision" bigint CHECK ("membership_process_status_snapshot_commit_revision" > 0),
        ADD COLUMN "godparents_snapshot_envelope" bytea,
        ADD COLUMN "godparents_snapshot_commit_revision" bigint CHECK ("godparents_snapshot_commit_revision" > 0)
    `);
    await queryRunner.query(`
      CREATE TABLE "e2ee_scalar_writes" (
        "client_epoch_id" uuid NOT NULL REFERENCES "e2ee_client_epochs"("id"),
        "record_id" uuid NOT NULL,
        "field_id" integer NOT NULL CHECK ("field_id" BETWEEN 1 AND 65535),
        "write_counter" bigint NOT NULL CHECK ("write_counter" > 0),
        "aggregate_type" integer NOT NULL CHECK ("aggregate_type" BETWEEN 256 AND 65535),
        "envelope_fingerprint" bytea NOT NULL CHECK (octet_length("envelope_fingerprint") = 32),
        "commit_revision" bigint NOT NULL CHECK ("commit_revision" > 0),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("client_epoch_id", "record_id", "field_id", "write_counter")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    throw new Error(
      "E2EE_TOPIC_MIGRATION_IRREVERSIBLE: plaintext Topic storage must not be restored",
    );
  }
}
