import { MigrationInterface, QueryRunner } from 'typeorm';

export class SectionTime1720000027000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE agenda_sections
      ADD COLUMN default_minutes integer NOT NULL DEFAULT 0 CHECK (default_minutes >= 0)`);
    await queryRunner.query(`CREATE TABLE meeting_section_times (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      section_id uuid NOT NULL REFERENCES agenda_sections(id) ON DELETE RESTRICT,
      minutes integer NOT NULL CHECK (minutes >= 0),
      CONSTRAINT meeting_section_times_unique UNIQUE (meeting_id, section_id)
    )`);
  }

  async down(): Promise<void> {
    throw new Error('Section time migration is forward-only');
  }
}
