import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExternalAuthentication1720000019000 implements MigrationInterface {
  name = 'ExternalAuthentication1720000019000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "external_auth_providers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" text NOT NULL CHECK ("type" IN ('oidc', 'churchtools')),
        "display_label" text NOT NULL,
        "issuer_url" text,
        "churchtools_url" text,
        "client_id" text,
        "public_base_url" text,
        "client_secret_envelope" text,
        "tested_fingerprint" text,
        "tested_at" timestamptz,
        "enabled" boolean NOT NULL DEFAULT false,
        "diagnostic_code" text,
        "removed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "external_provider_type_fields" CHECK (
          ("type" = 'oidc' AND "churchtools_url" IS NULL)
          OR ("type" = 'churchtools' AND "issuer_url" IS NULL AND "client_secret_envelope" IS NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "external_auth_one_current_provider"
      ON "external_auth_providers" ((true))
      WHERE "removed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "external_identities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id" uuid NOT NULL REFERENCES "external_auth_providers" ("id"),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "subject" text NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "linked_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("provider_id", "subject")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "external_identity_one_active_user_link"
      ON "external_identities" ("provider_id", "user_id")
      WHERE "active" = true
    `);
    await queryRunner.query(`
      CREATE TABLE "external_login_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider_id" uuid NOT NULL REFERENCES "external_auth_providers" ("id"),
        "purpose" text NOT NULL CHECK ("purpose" IN ('login', 'test')),
        "state_hash" text NOT NULL UNIQUE,
        "code_verifier" text NOT NULL,
        "nonce" text,
        "return_path" text NOT NULL DEFAULT '/',
        "configuration_fingerprint" text NOT NULL,
        "completion_code_hash" text UNIQUE,
        "completed_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "result_code" text,
        "expires_at" timestamptz NOT NULL,
        "callback_consumed_at" timestamptz,
        "completion_consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('CREATE INDEX "external_login_transactions_expiry" ON "external_login_transactions" ("expires_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "external_login_transactions"');
    await queryRunner.query('DROP TABLE "external_identities"');
    await queryRunner.query('DROP TABLE "external_auth_providers"');
  }
}
