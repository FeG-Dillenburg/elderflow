import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeploymentUpdates1720000024000 implements MigrationInterface {
  name = 'DeploymentUpdates1720000024000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE deployment_announcements (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        identifier text NOT NULL UNIQUE,
        category text NOT NULL CHECK (category IN ('feature', 'improvement', 'bugfix')),
        registered_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE deployment_update_initializations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        initialized_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE deployment_update_acknowledgements (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        announcement_id uuid NOT NULL REFERENCES deployment_announcements(id),
        acknowledged_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, announcement_id)
      );
      CREATE INDEX deployment_announcements_chronology
        ON deployment_announcements (registered_at, identifier);
      -- Existing users must receive the first release. Future users initialize
      -- their baseline atomically on their first authenticated catalog request.
      INSERT INTO deployment_update_initializations (user_id) SELECT id FROM users;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Deployment updates are a forward-only migration');
  }
}
