import { MigrationInterface, QueryRunner } from 'typeorm';

export class TopicTypes1720000005000 implements MigrationInterface {
  name = 'TopicTypes1720000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topics" ALTER COLUMN "description" DROP NOT NULL;

      UPDATE "topics"
      SET "type" = CASE
        WHEN "type" = 'recurring_agenda' OR "is_recurring" = true THEN 'recurring'
        WHEN "type" = 'person_related' THEN 'person'
        ELSE 'generic'
      END;

      ALTER TABLE "topics" ADD CONSTRAINT "topics_type_check"
        CHECK ("type" IN ('generic', 'person', 'new_membership', 'recurring'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "topics" DROP CONSTRAINT "topics_type_check";
      UPDATE "topics"
      SET "type" = CASE
        WHEN "type" = 'recurring' THEN 'recurring_agenda'
        WHEN "type" = 'person' THEN 'person_related'
        ELSE 'general'
      END;
      UPDATE "topics" SET "description" = '' WHERE "description" IS NULL;
      ALTER TABLE "topics" ALTER COLUMN "description" SET NOT NULL;
    `);
  }
}
