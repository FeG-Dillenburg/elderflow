import { MigrationInterface, QueryRunner } from 'typeorm';

export class E2eeKeyState1720000011000 implements MigrationInterface {
  name = 'E2eeKeyState1720000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "session_version" integer NOT NULL DEFAULT 1');
    await queryRunner.query(`
      CREATE TABLE "e2ee_key_state" (
        "id" integer PRIMARY KEY CHECK ("id" = 1),
        "organization_id" uuid NOT NULL UNIQUE,
        "generation" integer NOT NULL CHECK ("generation" > 0),
        "ork_id" uuid NOT NULL,
        "ock_id" uuid NOT NULL,
        "ock_epoch" integer NOT NULL CHECK ("ock_epoch" > 0),
        "shared_passphrase_slot" bytea NOT NULL,
        "recovery_slot" bytea NOT NULL,
        "content_key_wrapper" bytea NOT NULL,
        "custody_acknowledged_by" uuid NOT NULL REFERENCES "users"("id"),
        "custody_acknowledged_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "e2ee_client_epochs" (
        "id" uuid PRIMARY KEY,
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "nonce_prefix" bytea NOT NULL CHECK (octet_length("nonce_prefix") = 16),
        "signing_public_key" bytea NOT NULL CHECK (octet_length("signing_public_key") = 32),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz,
        UNIQUE ("organization_id", "nonce_prefix")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "e2ee_recovery_ceremonies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "initiator_id" uuid NOT NULL REFERENCES "users"("id"),
        "approver_id" uuid REFERENCES "users"("id"),
        "state" text NOT NULL CHECK ("state" IN ('pending_second_operator', 'ready_to_activate', 'activated', 'aborted')),
        "expected_generation" integer NOT NULL,
        "candidate_fingerprint" bytea NOT NULL CHECK (octet_length("candidate_fingerprint") = 32),
        "candidate_shared_passphrase_slot" bytea NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "activated_generation" integer,
        CHECK ("approver_id" IS NULL OR "approver_id" <> "initiator_id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "e2ee_one_active_recovery_ceremony"
      ON "e2ee_recovery_ceremonies" ((true))
      WHERE "state" IN ('pending_second_operator', 'ready_to_activate')
    `);
    await queryRunner.query(`
      CREATE TABLE "e2ee_audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_type" text NOT NULL,
        "actor_ids" jsonb NOT NULL,
        "key_generation" integer NOT NULL,
        "outcome" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "e2ee_audit_events"');
    await queryRunner.query('DROP TABLE "e2ee_recovery_ceremonies"');
    await queryRunner.query('DROP TABLE "e2ee_client_epochs"');
    await queryRunner.query('DROP TABLE "e2ee_key_state"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "session_version"');
  }
}
