import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { E2eeModule } from '../src/e2ee/e2ee.module';
import { E2eeKeyState } from '../src/e2ee/e2ee-key-state.entity';
import { AuthModule } from '../src/auth/auth.module';
import { SessionService } from '../src/auth/session.service';
import { TourProgress1720000023000 } from '../src/database/migrations/1720000023000-TourProgress';
import { migrations } from '../src/database/migrations';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { ToursModule } from '../src/tours/tours.module';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const schema = `tours_${process.pid}_${Date.now()}`;
const postgres = databaseUrl ? describe : describe.skip;

postgres('Versioned tour progress through authenticated HTTP', () => {
  let app: INestApplication;
  let admin: DataSource;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({ NODE_ENV: 'test', DEV_AUTH_BYPASS: false, AUTH_SESSION_SECRET: 'tour-tests-session-secret-32-characters' })] }),
        TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl, schema, entities: [User, E2eeRecoveryCeremony], autoLoadEntities: true, synchronize: true,
          extra: { options: `-c search_path=${schema},public` } }),
        AuthModule, ToursModule, E2eeModule,
      ],
    }).compile();
    const database = module.get(DataSource);
    const users = database.getRepository(User);
    for (const role of ['user', 'guest', 'it-admin'] as const) {
      const user = await users.save({ email: `${role}@example.com`, firstName: role, lastName: 'Tour', role, passwordHash: 'existing-password-hash' });
      tokens[role] = module.get(SessionService).create(user.id, user.sessionVersion);
    }
    await database.getRepository(E2eeKeyState).save({
      id: 1, organizationId: '00000000-0000-4000-8000-000000000001', generation: 1,
      orkId: '00000000-0000-4000-8000-000000000002', ockId: '00000000-0000-4000-8000-000000000003', ockEpoch: 1,
      sharedPassphraseSlot: Buffer.from('shared-slot'), recoverySlot: Buffer.from('recovery-slot'), contentKeyWrapper: Buffer.from('content-wrapper'),
      custodyAcknowledgedBy: (await users.findOneByOrFail({ role: 'user' })).id, custodyAcknowledgedAt: new Date(),
    });
    // Apply to a populated installation; the existing identities must survive.
    const runner = database.createQueryRunner();
    await new TourProgress1720000023000().up(runner);
    await runner.release();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const send = (role: string, event: string, stepId?: string, extra = {}) => request(app.getHttpServer())
    .post('/api/tours/events').auth(tokens[role], { type: 'bearer' })
    .send({ tourId: 'first-login', version: 1, event, stepId, ...extra });
  const list = (role: string) => request(app.getHttpServer()).get('/api/tours').auth(tokens[role], { type: 'bearer' });

  it('applies the tour migration last when upgrading current main without changing existing users', async () => {
    const upgradeSchema = `${schema}_upgrade`;
    await admin.query(`CREATE SCHEMA "${upgradeSchema}"`);
    const connect = (registered: typeof migrations) => new DataSource({
      type: 'postgres', url: databaseUrl, schema: upgradeSchema, migrations: registered,
      extra: { options: `-c search_path=${upgradeSchema},public` },
    }).initialize();
    let database: DataSource | undefined;
    try {
      database = await connect(migrations.filter((migration) => migration !== TourProgress1720000023000));
      await database.runMigrations();
      const [existingUser] = await database.query(`INSERT INTO users (email, first_name, last_name)
        VALUES ('upgrade@example.com', 'Existing', 'User') RETURNING *`);
      await database.destroy();
      database = await connect(migrations);
      const applied = await database.runMigrations();
      expect(applied.map((migration) => migration.name)).toEqual(['TourProgress1720000023000']);
      expect(await database.query('SELECT * FROM users WHERE id = $1', [existingUser.id])).toEqual([existingUser]);
      expect(await database.query('SELECT * FROM tour_progress')).toEqual([]);
      expect(await database.runMigrations()).toEqual([]);
    } finally {
      if (database?.isInitialized) await database.destroy();
      await admin.query(`DROP SCHEMA "${upgradeSchema}" CASCADE`);
    }
  });

  it('preserves existing identities, records retries and keeps completion across replay and concurrent skips', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').auth(tokens.user, { type: 'bearer' }).expect(200);
    expect((await list('user').expect(200)).body).toEqual([]);
    await send('user', 'start', 'welcome').expect(201);
    const skipped = await send('user', 'skip', 'dashboard-overview').expect(201);
    expect(skipped.body).toMatchObject({ state: 'skipped', attempts: 1, completedAt: null });
    expect(skipped.body.lastSkippedAt).toBeTruthy();
    await send('user', 'start', 'welcome').expect(201);
    await send('user', 'complete', 'sign-out').expect(201);
    await Promise.all([send('user', 'start', 'welcome').expect(201), send('user', 'skip', 'welcome').expect(201)]);
    const progress = (await list('user').expect(200)).body[0];
    expect(progress).toMatchObject({ state: 'completed', attempts: 3, firstStartedAt: skipped.body.firstStartedAt });
    expect(progress.completedAt).toBeTruthy();
    expect((await list('guest').expect(200)).body).toEqual([]);
  });

  it('enforces identities, audiences, versions, stable steps, and explicit final-step completion', async () => {
    await request(app.getHttpServer()).get('/api/tours').expect(401);
    await send('guest', 'start', 'welcome').expect(201);
    await send('guest', 'start', undefined, { tourId: 'new-topic-dialog' }).expect(403);
    await send('it-admin', 'start', 'welcome').expect(403);
    await send('user', 'complete', 'welcome').expect(400);
    await send('user', 'step', 'unknown').expect(400);
    await send('user', 'start', 'welcome', { version: 2 }).expect(400);
    await send('user', 'start', 'welcome', { userId: 'another-user' }).expect(400);
  });
  it('lets Guests read unlock wrappers and own epochs, but denies recovery and epoch replacement', async () => {
    for (const path of ['key-state', 'key-state/shared-passphrase-slot', 'key-state/content-key-wrapper', 'key-state/content-key-wrappers']) {
      await request(app.getHttpServer()).get(`/api/e2ee/${path}`).auth(tokens.guest, { type: 'bearer' }).expect(200);
      await request(app.getHttpServer()).get(`/api/e2ee/${path}`).auth(tokens['it-admin'], { type: 'bearer' }).expect(403);
    }
    for (const path of ['recovery-metadata', 'recovery-slot', 'key-ceremonies/active']) {
      await request(app.getHttpServer()).get(`/api/e2ee/${path}`).auth(tokens.guest, { type: 'bearer' }).expect(403);
    }
    const epoch = { id: '00000000-0000-4000-8000-000000000081', noncePrefix: Buffer.alloc(16, 8).toString('base64url'), signingPublicKey: Buffer.alloc(32, 8).toString('base64url') };
    await request(app.getHttpServer()).post('/api/e2ee/client-epochs').auth(tokens.user, { type: 'bearer' }).send(epoch).expect(201);
    await request(app.getHttpServer()).post('/api/e2ee/client-epochs').auth(tokens.guest, { type: 'bearer' }).send(epoch).expect(409);
    const ownEpoch = { ...epoch, id: '00000000-0000-4000-8000-000000000082' };
    await request(app.getHttpServer()).post('/api/e2ee/client-epochs').auth(tokens.guest, { type: 'bearer' }).send(ownEpoch).expect(201);
    await request(app.getHttpServer()).post(`/api/e2ee/client-epochs/${ownEpoch.id}/revoke`).auth(tokens.guest, { type: 'bearer' }).expect(204);
  });

});
