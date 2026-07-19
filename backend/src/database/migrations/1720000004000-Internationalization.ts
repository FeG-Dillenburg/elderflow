import { MigrationInterface, QueryRunner } from 'typeorm';

export class Internationalization1720000004000 implements MigrationInterface {
  name = 'Internationalization1720000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "language" text;
      ALTER TABLE "users" ADD CONSTRAINT "users_language_check"
        CHECK ("language" IN ('en', 'de'));

      CREATE TABLE "installation_settings" (
        "id" smallint PRIMARY KEY,
        "default_language" text NOT NULL,
        CONSTRAINT "installation_settings_singleton_check" CHECK ("id" = 1),
        CONSTRAINT "installation_settings_language_check" CHECK ("default_language" IN ('en', 'de'))
      );

      INSERT INTO "installation_settings" ("id", "default_language")
        SELECT 1, 'en' WHERE EXISTS (SELECT 1 FROM "users");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "installation_settings";
      ALTER TABLE "users" DROP CONSTRAINT "users_language_check";
      ALTER TABLE "users" DROP COLUMN "language";
    `);
  }
}
