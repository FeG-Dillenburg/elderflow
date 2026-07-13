import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1720000000000 implements MigrationInterface {
  name = 'CreateUsers1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text UNIQUE NOT NULL,
        "first_name" text NOT NULL,
        "last_name" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "users"');
  }
}

