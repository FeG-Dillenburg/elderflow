import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocalAuthentication1720000003000 implements MigrationInterface {
  name = 'LocalAuthentication1720000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "password_hash" text;
      UPDATE "users" SET "role" = CASE
        WHEN "role" = 'leadership' THEN 'user'
        WHEN "role" = 'viewer' THEN 'guest'
        ELSE "role"
      END;
      ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
      ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
        CHECK ("role" IN ('superadmin', 'it-admin', 'admin', 'user', 'guest'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "users_role_check";
      UPDATE "users" SET "role" = CASE
        WHEN "role" IN ('superadmin', 'it-admin', 'admin') THEN 'admin'
        WHEN "role" = 'user' THEN 'leadership'
        ELSE 'viewer'
      END;
      ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'leadership';
      ALTER TABLE "users" DROP COLUMN "password_hash";
    `);
  }
}
