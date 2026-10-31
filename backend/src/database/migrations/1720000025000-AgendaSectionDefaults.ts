import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgendaSectionDefaults1720000025000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE agenda_sections ADD COLUMN default_topic_type text;
      ALTER TABLE agenda_sections ADD CONSTRAINT agenda_sections_default_topic_type_check
        CHECK (default_topic_type IS NULL OR default_topic_type IN ('generic', 'person', 'new_membership', 'recurring'));
      ALTER TABLE agenda_sections ADD CONSTRAINT agenda_sections_default_topic_type_unique UNIQUE (default_topic_type);
      ALTER TABLE agenda_sections DROP COLUMN is_default;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Agenda section defaults is a forward-only migration');
  }
}
