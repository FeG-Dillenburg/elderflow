import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { SessionService } from '../src/auth/session.service';
import { migrations } from '../src/database/migrations';
import { DeploymentUpdates1720000024000 } from '../src/database/migrations/1720000024000-DeploymentUpdates';
import { DeploymentUpdatesModule } from '../src/deployment-updates/deployment-updates.module';
import { DeploymentUpdatesService } from '../src/deployment-updates/deployment-updates.service';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
const schema = `deployment_updates_${process.pid}_${Date.now()}`;
interface Announcement { id: string; identifier: string; category: string; registeredAt: string }

postgres('Deployment announcements on an existing installation', () => {
  let admin: DataSource;
  let database: DataSource;
  let app: INestApplication;
  let updates: DeploymentUpdatesService;
  let sessions: SessionService;
  const users: Record<string, User> = {};
  const tokens: Record<string, string> = {};
  let oldUser: Record<string, unknown>;

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = await new DataSource({ type: 'postgres', url: databaseUrl, schema,
      migrations: migrations.filter((migration) => migration !== DeploymentUpdates1720000024000),
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    await database.runMigrations();
    [oldUser] = await database.query(`INSERT INTO users (email, first_name, last_name, password_hash)
      VALUES ('existing@example.com', 'Existing', 'User', 'preserved-hash') RETURNING *`);
    await database.destroy();
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({
        NODE_ENV: 'test', DEV_AUTH_BYPASS: false, AUTH_SESSION_SECRET: 'deployment-update-tests-secret-32-characters',
      })] }),
      TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl, schema, entities: [User, E2eeRecoveryCeremony],
        migrations, migrationsRun: true, synchronize: false,
        extra: { options: `-c search_path=${schema},public` } }),
      AuthModule, DeploymentUpdatesModule,
    ] }).compile();
    database = module.get(DataSource);
    updates = module.get(DeploymentUpdatesService);
    sessions = module.get(SessionService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const existing = await database.getRepository(User).findOneByOrFail({ email: 'existing@example.com' });
    users.existing = existing;
    tokens.existing = sessions.create(existing.id, existing.sessionVersion);
  });

  afterAll(async () => {
    await app?.close();
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  async function newUser(name: string, role: User['role'] = 'user') {
    const user = await database.getRepository(User).save({ email: `${name}@example.com`,
      firstName: name, lastName: 'Updates', role, passwordHash: 'preserved-hash' });
    users[name] = user;
    tokens[name] = sessions.create(user.id, user.sessionVersion);
  }
  const unread = (name: string) => request(app.getHttpServer()).post('/api/deployment-updates/unread')
    .auth(tokens[name], { type: 'bearer' });
  const acknowledge = (name: string, ids: string[], extra = {}) => request(app.getHttpServer())
    .post('/api/deployment-updates/acknowledge').auth(tokens[name], { type: 'bearer' }).send({ ids, ...extra });
  const history = (name: string) => request(app.getHttpServer()).get('/api/deployment-updates/history')
    .auth(tokens[name], { type: 'bearer' });

  it('upgrades populated main forward-only and existing users receive the first database-dated entry', async () => {
    expect(await database.query('SELECT * FROM users WHERE id = $1', [oldUser.id])).toEqual([oldUser]);
    expect(await database.runMigrations()).toEqual([]);
    const entries = (await unread('existing').expect(200)).body as Announcement[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ identifier: 'deployment-updates-dialog', category: 'feature' });
    expect(Date.parse(entries[0].registeredAt)).toBeGreaterThan(Date.now() - 60000);
    await expect(new DeploymentUpdates1720000024000().down()).rejects.toThrow('forward-only');
  });

  it('baselines a new user once across simultaneous sessions, including all roles without keys', async () => {
    for (const role of ['superadmin', 'admin', 'user', 'guest', 'it-admin'] as const) {
      await newUser(role, role);
      const replies = await Promise.all([unread(role).expect(200), unread(role).expect(200)]);
      expect(replies.map((reply) => reply.body)).toEqual([[], []]);
      expect((await history(role).expect(200)).body).toHaveLength(1);
    }
  });

  it('acknowledges only displayed IDs for the authenticated user and retains later deployments', async () => {
    const shown = (await unread('existing').expect(200)).body as Announcement[];
    await updates.register([{ id: 'later-change', category: 'improvement' }]);
    await Promise.all([acknowledge('existing', shown.map((entry) => entry.id)).expect(204),
      acknowledge('existing', shown.map((entry) => entry.id)).expect(204)]);
    expect((await unread('existing').expect(200)).body.map((entry: Announcement) => entry.identifier)).toEqual(['later-change']);
    expect((await unread('guest').expect(200)).body.map((entry: Announcement) => entry.identifier)).toEqual(['later-change']);
    const latest = (await history('existing').expect(200)).body;
    expect(latest).toHaveLength(2);
    expect((await unread('existing').expect(200)).body).toHaveLength(1);
  });

  it('preserves dates and read state across concurrent registration, reorder, removal, and restart', async () => {
    const before = (await history('existing').expect(200)).body;
    await Promise.all([
      updates.register([{ id: 'later-change', category: 'improvement' }, { id: 'deployment-updates-dialog', category: 'feature' }]),
      updates.register([{ id: 'deployment-updates-dialog', category: 'feature' }, { id: 'later-change', category: 'improvement' }]),
    ]);
    await updates.register([]);
    await updates.onModuleInit();
    expect((await history('existing').expect(200)).body).toEqual(before);
    expect((await unread('existing').expect(200)).body).toHaveLength(1);
  });

  it('rejects an entire invalid manifest without partially registering it', async () => {
    for (const manifest of [
      [{ id: 'never-insert', category: 'feature' }, { id: 'invalid', category: 'wrong' }],
      [{ id: 'never-insert', category: 'feature' }, { id: 'never-insert', category: 'bugfix' }],
      null, [null], [{ id: '', category: 'feature' }],
    ]) await expect(updates.register(manifest)).rejects.toThrow(/manifest|Invalid|Duplicate/);
    expect((await history('existing').expect(200)).body).toHaveLength(2);
  });

  it('requires authentication and validates bounded UUID sets without accepting another identity', async () => {
    await request(app.getHttpServer()).post('/api/deployment-updates/unread').expect(401);
    await request(app.getHttpServer()).get('/api/deployment-updates/history').expect(401);
    await request(app.getHttpServer()).post('/api/deployment-updates/acknowledge').send({ ids: [] }).expect(401);
    await acknowledge('existing', ['not-a-uuid']).expect(400);
    await acknowledge('existing', ['00000000-0000-4000-8000-000000000000']).expect(400);
    const shown = (await unread('existing').expect(200)).body as Announcement[];
    await acknowledge('existing', shown.map((entry) => entry.id), { userId: users.guest.id }).expect(400);
    await acknowledge('existing', [shown[0].id, '00000000-0000-4000-8000-000000000000']).expect(400);
    await acknowledge('existing', Array(1001).fill(shown[0].id)).expect(400);
    await acknowledge('existing', []).expect(204);
    expect((await unread('existing').expect(200)).body).toEqual(shown);
  });

  it('returns every unread entry but selects the latest 50 for history', async () => {
    await newUser('long-history');
    await unread('long-history').expect(200);
    await updates.register(Array.from({ length: 60 }, (_, index) => ({
      id: `release-${String(index).padStart(3, '0')}`, category: 'bugfix',
    })));
    expect((await unread('long-history').expect(200)).body).toHaveLength(60);
    const latest = (await history('long-history').expect(200)).body as Announcement[];
    expect(latest).toHaveLength(50);
    expect(latest[0].identifier).toBe('release-059');
    expect(latest[49].identifier).toBe('release-010');
    await newUser('future-user');
    expect((await unread('future-user').expect(200)).body).toEqual([]);
    await updates.register([{ id: 'future-deployment', category: 'feature' }]);
    expect((await unread('future-user').expect(200)).body.map((entry: Announcement) => entry.identifier)).toEqual(['future-deployment']);
  });
});
