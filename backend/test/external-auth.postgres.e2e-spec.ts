import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAuthentication1720000019000 } from '../src/database/migrations/1720000019000-ExternalAuthentication';
import { SessionService } from '../src/auth/session.service';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { ExternalAuthModule } from '../src/external-auth/external-auth.module';
import { ExternalAuthProvider } from '../src/external-auth/external-auth-provider.entity';
import { ExternalIdentity } from '../src/external-auth/external-identity.entity';
import { ExternalLoginTransaction } from '../src/external-auth/external-login-transaction.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `external_auth_${process.pid}_${Date.now()}`;
const migrationSchema = `${schema}_migration`;

describeWithPostgres('External login HTTP API with PostgreSQL and a local provider (e2e)', () => {
  let admin: DataSource;
  let app: INestApplication;
  let database: DataSource;
  let providerServer: Server;
  let providerUrl: string;
  let adminToken: string;
  let userToken: string;
  let itAdminToken: string;
  let ordinaryAdminToken: string;
  let churchIdentity: { id: number; email: string } = { id: 4711, email: 'member@example.com' };
  let oidcNonce = '';
  const oidcKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const oidcJwk = { ...oidcKeys.publicKey.export({ format: 'jwk' }), kid: 'oidc-key', alg: 'RS256', use: 'sig' };

  beforeAll(async () => {
    providerServer = createServer((req, res) => {
      if (req.url === '/.well-known/openid-configuration') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ issuer: providerUrl, authorization_endpoint: `${providerUrl}/oidc/authorize`, token_endpoint: `${providerUrl}/oidc/token`, jwks_uri: `${providerUrl}/oidc/jwks`, id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['none'] }));
        return;
      }
      if (req.url === '/oidc/jwks') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ keys: [oidcJwk] }));
        return;
      }
      if (req.url === '/oidc/token' && req.method === 'POST') {
        const now = Math.floor(Date.now() / 1000);
        const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const unsigned = `${encode({ alg: 'RS256', kid: 'oidc-key' })}.${encode({ iss: providerUrl, aud: 'oidc-client', sub: 'oidc-subject', nonce: oidcNonce, iat: now, exp: now + 300, email: 'member@example.com', email_verified: true })}`;
        const idToken = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), oidcKeys.privateKey).toString('base64url')}`;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id_token: idToken, access_token: 'discarded-oidc-token', token_type: 'Bearer' }));
        return;
      }
      if (req.url === '/oauth/access_token' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'provider-token', token_type: 'Bearer' }));
        return;
      }
      if (req.url === '/oauth/userinfo' && req.headers.authorization === 'Bearer provider-token') {
        res.setHeader('Content-Type', 'application/json');
        const profile = { ...churchIdentity, firstName: 'Provider', groups: [] };
        res.end(JSON.stringify({ data: profile, ...profile }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => providerServer.listen(0, '127.0.0.1', resolve));
    const address = providerServer.address();
    providerUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({ NODE_ENV: 'test', DEV_AUTH_BYPASS: false, AUTH_SESSION_SECRET: 'external-auth-e2e-session-secret-32-characters' })] }),
        TypeOrmModule.forRoot({
          type: 'postgres', url: databaseUrl, schema,
          entities: [User, ExternalAuthProvider, ExternalIdentity, ExternalLoginTransaction, E2eeRecoveryCeremony],
          synchronize: true,
        }),
        ExternalAuthModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    database = module.get(DataSource);
    const users = database.getRepository(User);
    const superadmin = await users.save({ email: 'admin@example.com', firstName: 'Admin', lastName: 'User', role: 'superadmin', language: 'en', passwordHash: 'local-password-remains', archivedAt: null });
    const member = await users.save({ email: 'member@example.com', firstName: 'Local', lastName: 'Member', role: 'user', language: 'de', passwordHash: 'local-password-remains', archivedAt: null });
    const itAdmin = await users.save({ email: 'it@example.com', firstName: 'IT', lastName: 'Admin', role: 'it-admin', language: 'en', passwordHash: 'local-password-remains', archivedAt: null });
    const ordinaryAdmin = await users.save({ email: 'ordinary-admin@example.com', firstName: 'Ordinary', lastName: 'Admin', role: 'admin', language: 'en', passwordHash: 'local-password-remains', archivedAt: null });
    await users.save({ email: 'guest@example.com', firstName: 'Guest', lastName: 'User', role: 'guest', language: 'en', passwordHash: 'local-password-remains', archivedAt: null });
    const sessions = module.get(SessionService);
    adminToken = sessions.create(superadmin.id, superadmin.sessionVersion);
    userToken = sessions.create(member.id, member.sessionVersion);
    itAdminToken = sessions.create(itAdmin.id, itAdmin.sessionVersion);
    ordinaryAdminToken = sessions.create(ordinaryAdmin.id, ordinaryAdmin.sessionVersion);
  });

  afterAll(async () => {
    if (app) await app.close();
    await new Promise<void>((resolve) => providerServer?.close(() => resolve()));
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA IF EXISTS "${migrationSchema}" CASCADE`);
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('upgrades an existing installation without changing its Users or installation data', async () => {
    await admin.query(`CREATE SCHEMA "${migrationSchema}"`);
    const migrationDatabase = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema: migrationSchema,
    });
    await migrationDatabase.initialize();
    const runner = migrationDatabase.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${migrationSchema}"`);
      await runner.query(`CREATE TABLE "users" ("id" uuid PRIMARY KEY, "email" text NOT NULL)`);
      await runner.query(`CREATE TABLE "installation_settings" ("id" integer PRIMARY KEY, "name" text NOT NULL)`);
      await runner.query(`INSERT INTO "users" ("id", "email") VALUES ('00000000-0000-4000-8000-000000000066', 'existing@example.com')`);
      await runner.query(`INSERT INTO "installation_settings" ("id", "name") VALUES (1, 'Existing installation')`);

      await new ExternalAuthentication1720000019000().up(runner);

      await expect(runner.query(`SELECT "email" FROM "users"`)).resolves.toEqual([
        { email: 'existing@example.com' },
      ]);
      await expect(runner.query(`SELECT "name" FROM "installation_settings"`)).resolves.toEqual([
        { name: 'Existing installation' },
      ]);
      const tables = await runner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
      `, [migrationSchema]) as Array<{ table_name: string }>;
      expect(tables.map(({ table_name }) => table_name)).toEqual(expect.arrayContaining([
        'external_auth_providers',
        'external_identities',
        'external_login_transactions',
      ]));
    } finally {
      await runner.release();
      await migrationDatabase.destroy();
    }
  });

  it('protects settings, requires a real test, and completes a one-time ChurchTools login without changing the Local User', async () => {
    await request(app.getHttpServer()).get('/api/auth-settings/provider').set('Authorization', `Bearer ${userToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/auth-settings/provider').set('Authorization', `Bearer ${ordinaryAdminToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/auth-settings/provider').set('Authorization', `Bearer ${itAdminToken}`).expect(200);

    const configured = await request(app.getHttpServer())
      .put('/api/auth-settings/provider')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'churchtools', displayLabel: 'ChurchTools', churchToolsUrl: providerUrl, clientId: 'elderflow-client', publicBaseUrl: 'http://localhost:5173' })
      .expect(200);
    expect(configured.body).toMatchObject({ status: 'draft', enabled: false, clientSecretConfigured: false });
    expect(configured.body).not.toHaveProperty('clientSecretEnvelope');
    await request(app.getHttpServer()).patch('/api/auth-settings/provider/enable').set('Authorization', `Bearer ${adminToken}`).expect(409);

    const testStart = await request(app.getHttpServer()).post('/api/auth-settings/provider/test').set('Authorization', `Bearer ${adminToken}`).expect(201);
    const testState = new URL(testStart.body.authorizationUrl).searchParams.get('state')!;
    const testCallback = await request(app.getHttpServer()).get('/api/auth/external/callback').query({ state: testState, code: 'test-code' }).expect(303);
    expect(testCallback.headers.location).toContain('/authentication-settings?test=');
    await request(app.getHttpServer()).patch('/api/auth-settings/provider/enable').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app.getHttpServer()).get('/api/auth/external/provider').expect(200).expect({ type: 'churchtools', displayLabel: 'ChurchTools' });

    const loginStart = await request(app.getHttpServer()).post('/api/auth/external/start').send({ returnPath: '/meetings' }).expect(201);
    const loginState = new URL(loginStart.body.authorizationUrl).searchParams.get('state')!;
    const callback = await request(app.getHttpServer()).get('/api/auth/external/callback').query({ state: loginState, code: 'login-code' }).expect(303);
    expect(callback.headers.location).not.toContain('Bearer');
    expect(callback.headers.location).not.toContain('provider-token');
    const completionCode = new URL(callback.headers.location).searchParams.get('code')!;
    const completed = await request(app.getHttpServer()).post('/api/auth/external/complete').send({ code: completionCode }).expect(201);
    expect(completed.body.user).toMatchObject({ email: 'member@example.com', firstName: 'Local', role: 'user', language: 'de' });
    await request(app.getHttpServer()).post('/api/auth/external/complete').send({ code: completionCode }).expect(401);

    const persisted = await database.getRepository(User).findOneByOrFail({ email: 'member@example.com' });
    expect(persisted).toMatchObject({ firstName: 'Local', role: 'user' });
    expect(await database.getRepository(ExternalIdentity).count()).toBe(1);

    for (const [index, email, role] of [
      [1, 'admin@example.com', 'superadmin'],
      [2, 'it@example.com', 'it-admin'],
      [3, 'ordinary-admin@example.com', 'admin'],
      [4, 'guest@example.com', 'guest'],
    ] as const) {
      churchIdentity = { id: 5000 + index, email };
      const roleStart = await request(app.getHttpServer()).post('/api/auth/external/start').send({ returnPath: '/' }).expect(201);
      const roleState = new URL(roleStart.body.authorizationUrl).searchParams.get('state')!;
      const roleCallback = await request(app.getHttpServer()).get('/api/auth/external/callback').query({ state: roleState, code: `role-${index}` }).expect(303);
      const roleCode = new URL(roleCallback.headers.location).searchParams.get('code')!;
      const roleSession = await request(app.getHttpServer()).post('/api/auth/external/complete').send({ code: roleCode }).expect(201);
      expect(roleSession.body.user.role).toBe(role);
    }

    await request(app.getHttpServer()).delete('/api/auth-settings/provider').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(await database.getRepository(ExternalIdentity).countBy({ active: true })).toBe(0);

    await request(app.getHttpServer())
      .put('/api/auth-settings/provider')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'oidc', displayLabel: 'Company SSO', issuerUrl: providerUrl, clientId: 'oidc-client', publicBaseUrl: 'http://localhost:5173' })
      .expect(200);
    const oidcTest = await request(app.getHttpServer()).post('/api/auth-settings/provider/test').set('Authorization', `Bearer ${adminToken}`).expect(201);
    const oidcTestUrl = new URL(oidcTest.body.authorizationUrl);
    oidcNonce = oidcTestUrl.searchParams.get('nonce')!;
    expect(oidcTestUrl.searchParams.get('scope')).toBe('openid email');
    expect(oidcTestUrl.searchParams.get('code_challenge_method')).toBe('S256');
    await request(app.getHttpServer()).get('/api/auth/external/callback').query({ state: oidcTestUrl.searchParams.get('state'), code: 'oidc-test-code' }).expect(303);
    await request(app.getHttpServer()).patch('/api/auth-settings/provider/enable').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const oidcLogin = await request(app.getHttpServer()).post('/api/auth/external/start').send({ returnPath: '//attacker.example' }).expect(201);
    const oidcLoginUrl = new URL(oidcLogin.body.authorizationUrl);
    oidcNonce = oidcLoginUrl.searchParams.get('nonce')!;
    const oidcCallback = await request(app.getHttpServer()).get('/api/auth/external/callback').query({ state: oidcLoginUrl.searchParams.get('state'), code: 'oidc-login-code' }).expect(303);
    expect(new URL(oidcCallback.headers.location).searchParams.get('return')).toBe('/');
    expect(oidcCallback.headers.location).not.toContain('discarded-oidc-token');
    const oidcCompletionCode = new URL(oidcCallback.headers.location).searchParams.get('code')!;
    await request(app.getHttpServer()).post('/api/auth/external/complete').send({ code: oidcCompletionCode }).expect(201);
    expect(await database.getRepository(ExternalIdentity).count()).toBe(6);
  });
});
