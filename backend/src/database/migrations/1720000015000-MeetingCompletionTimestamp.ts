import { MigrationInterface, QueryRunner } from "typeorm";

export class MeetingCompletionTimestamp1720000015000 implements MigrationInterface {
  name = "MeetingCompletionTimestamp1720000015000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meetings"
        ADD COLUMN "completed_at" timestamptz;
    `);
    await queryRunner.query(`
      UPDATE "meetings"
        SET "completed_at" = "updated_at"
        WHERE "status" = 'completed';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meetings"
        DROP COLUMN "completed_at";
    `);
  }
}
