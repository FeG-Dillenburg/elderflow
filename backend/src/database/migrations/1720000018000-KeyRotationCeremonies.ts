import { MigrationInterface, QueryRunner } from 'typeorm';

export class KeyRotationCeremonies1720000018000 implements MigrationInterface {
  name = 'KeyRotationCeremonies1720000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "e2ee_client_epochs"
        ADD COLUMN "write_grace_until" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "e2ee_recovery_ceremonies"
        ADD COLUMN "operation" text NOT NULL DEFAULT 'lost_passphrase',
        ADD COLUMN "reason_code" text NOT NULL DEFAULT 'passphrase_lost',
        ADD COLUMN "candidate_ork_id" uuid,
        ADD COLUMN "candidate_ock_id" uuid,
        ADD COLUMN "candidate_ock_epoch" integer,
        ADD COLUMN "candidate_recovery_slot" bytea,
        ADD COLUMN "candidate_content_key_wrapper" bytea,
        ADD COLUMN "candidate_historical_ock_ids" uuid[] NOT NULL DEFAULT '{}',
        ADD COLUMN "candidate_historical_ock_epochs" integer[] NOT NULL DEFAULT '{}',
        ADD COLUMN "candidate_historical_content_key_wrappers" bytea[] NOT NULL DEFAULT '{}',
        ADD COLUMN "custody_copies_acknowledged" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "e2ee_recovery_ceremonies" AS ceremony
      SET
        "candidate_ork_id" = state."ork_id",
        "candidate_ock_id" = state."ock_id",
        "candidate_ock_epoch" = state."ock_epoch",
        "candidate_recovery_slot" = state."recovery_slot",
        "candidate_content_key_wrapper" = state."content_key_wrapper"
      FROM "e2ee_key_state" AS state
      WHERE state."id" = 1
    `);
    await queryRunner.query(`
      ALTER TABLE "e2ee_recovery_ceremonies"
        ALTER COLUMN "candidate_ork_id" SET NOT NULL,
        ALTER COLUMN "candidate_ock_id" SET NOT NULL,
        ALTER COLUMN "candidate_ock_epoch" SET NOT NULL,
        ALTER COLUMN "candidate_recovery_slot" SET NOT NULL,
        ALTER COLUMN "candidate_content_key_wrapper" SET NOT NULL,
        ADD CONSTRAINT "e2ee_key_ceremony_operation"
          CHECK ("operation" IN ('lost_passphrase', 'change_passphrase', 'replace_recovery_secret', 'rotate_root_key', 'rotate_root_and_content_key')),
        ADD CONSTRAINT "e2ee_key_ceremony_custody_copies"
          CHECK ("custody_copies_acknowledged" IN (0, 2))
    `);
    await queryRunner.query(`
      CREATE TABLE "e2ee_content_key_wrappers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "ork_id" uuid NOT NULL,
        "ock_id" uuid NOT NULL,
        "ock_epoch" integer NOT NULL CHECK ("ock_epoch" > 0),
        "wrapper" bytea NOT NULL,
        "activated_at" timestamptz NOT NULL DEFAULT now(),
        "writable_until" timestamptz,
        "retained_until" timestamptz,
        UNIQUE ("ork_id", "ock_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "e2ee_content_key_wrappers"
        ("organization_id", "ork_id", "ock_id", "ock_epoch", "wrapper")
      SELECT "organization_id", "ork_id", "ock_id", "ock_epoch", "content_key_wrapper"
      FROM "e2ee_key_state"
      WHERE "id" = 1
      ON CONFLICT ("ork_id", "ock_id") DO NOTHING
    `);
    await queryRunner.query(`
      ALTER TABLE "e2ee_audit_events"
        ADD COLUMN "operation" text,
        ADD COLUMN "reason_code" text,
        ADD COLUMN "ork_id" uuid,
        ADD COLUMN "ock_id" uuid
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "e2ee_client_epochs" DROP COLUMN "write_grace_until"');
    await queryRunner.query('ALTER TABLE "e2ee_audit_events" DROP COLUMN "ock_id", DROP COLUMN "ork_id", DROP COLUMN "reason_code", DROP COLUMN "operation"');
    await queryRunner.query('DROP TABLE "e2ee_content_key_wrappers"');
    await queryRunner.query(`
      ALTER TABLE "e2ee_recovery_ceremonies"
        DROP CONSTRAINT "e2ee_key_ceremony_custody_copies",
        DROP CONSTRAINT "e2ee_key_ceremony_operation",
        DROP COLUMN "custody_copies_acknowledged",
        DROP COLUMN "candidate_content_key_wrapper",
        DROP COLUMN "candidate_historical_content_key_wrappers",
        DROP COLUMN "candidate_historical_ock_epochs",
        DROP COLUMN "candidate_historical_ock_ids",
        DROP COLUMN "candidate_recovery_slot",
        DROP COLUMN "candidate_ock_epoch",
        DROP COLUMN "candidate_ock_id",
        DROP COLUMN "candidate_ork_id",
        DROP COLUMN "reason_code",
        DROP COLUMN "operation"
    `);
  }
}
