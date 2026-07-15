import dataSource from '../data-source';

async function seed(): Promise<void> {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? 'development')) {
    throw new Error('Development seed data is disabled outside development and test environments');
  }

  await dataSource.initialize();
  await dataSource.query(`
    INSERT INTO "users" ("email", "first_name", "last_name", "role") VALUES
      ('alex@example.com', 'Alex', 'Morgan', 'admin'),
      ('maria@example.com', 'Maria', 'Keller', 'leadership'),
      ('sam@example.com', 'Sam', 'Weber', 'viewer')
    ON CONFLICT ("email") DO UPDATE SET
      "first_name" = EXCLUDED."first_name",
      "last_name" = EXCLUDED."last_name",
      "role" = EXCLUDED."role";
  `);
  await dataSource.destroy();
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
