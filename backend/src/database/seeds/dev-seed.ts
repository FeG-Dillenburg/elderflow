import dataSource from '../data-source';
import { hash } from 'bcryptjs';

async function seed(): Promise<void> {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? 'development')) {
    throw new Error('Development seed data is disabled outside development and test environments');
  }

  await dataSource.initialize();
  const passwordHash = await hash('password123!', 12);
  await dataSource.query(`
    INSERT INTO "users" ("email", "first_name", "last_name", "role", "password_hash") VALUES
      ('alex@example.com', 'Alex', 'Morgan', 'superadmin', $1),
      ('ivan@example.com', 'Ivan', 'Fischer', 'it-admin', $1),
      ('anna@example.com', 'Anna', 'Schmidt', 'admin', $1),
      ('maria@example.com', 'Maria', 'Keller', 'user', $1),
      ('sam@example.com', 'Sam', 'Weber', 'guest', $1)
    ON CONFLICT ("email") DO UPDATE SET
      "first_name" = EXCLUDED."first_name",
      "last_name" = EXCLUDED."last_name",
      "role" = EXCLUDED."role",
      "password_hash" = EXCLUDED."password_hash",
      "archived_at" = NULL;
  `, [passwordHash]);
  await dataSource.destroy();
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
