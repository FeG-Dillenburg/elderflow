import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChurchToolsClientSecrets1720000022000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "external_auth_providers"
      DROP CONSTRAINT "external_provider_type_fields",
      ADD CONSTRAINT "external_provider_type_fields" CHECK (
        ("type" = 'oidc' AND "churchtools_url" IS NULL)
        OR ("type" = 'churchtools' AND "issuer_url" IS NULL)
      )
    `);
  }

  async down(): Promise<void> {
    throw new Error('ChurchTools client secrets are a forward-only migration');
  }
}
