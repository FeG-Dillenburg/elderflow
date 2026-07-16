import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArchiveUsers1720000002000 implements MigrationInterface {
  name = 'ArchiveUsers1720000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "archived_at" timestamptz');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "archived_at"');
  }
}
