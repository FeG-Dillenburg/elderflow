import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { AgendaSectionsModule } from '../src/agenda-sections/agenda-sections.module';
import { AuthModule } from '../src/auth/auth.module';
import { SessionService } from '../src/auth/session.service';
import { migrations } from '../src/database/migrations';
import { AgendaSectionDefaults1720000025000 } from '../src/database/migrations/1720000025000-AgendaSectionDefaults';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
const schema = `agenda_sections_${process.pid}_${Date.now()}`;

postgres('Agenda section API and existing-data upgrade', () => {
  let admin: DataSource;
  let database: DataSource;
  let app: INestApplication;
  let token: string;
  let guestToken: string;
  let sectionIds: string[];
  let topicBefore: unknown[];
  let appearanceBefore: unknown[];
  let sectionsBefore: any[];

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = await new DataSource({ type: 'postgres', url: databaseUrl, schema,
      migrations: migrations.filter((migration) => migration !== AgendaSectionDefaults1720000025000),
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    await database.runMigrations();
    sectionsBefore = await database.query(`INSERT INTO agenda_sections (name, position, is_default)
      VALUES ('People', 3, true), ('Discussion', 8, false) RETURNING *`);
    sectionsBefore = await database.query('SELECT * FROM agenda_sections ORDER BY position, id');
    sectionIds = sectionsBefore.map((row) => row.id);
    const [topic] = await database.query(`INSERT INTO topics
      (type, default_section_id, name_envelope, description_envelope, membership_process_status_envelope, godparents_envelope)
      VALUES ('generic', $1, '\\x01', '\\x02', '\\x03', '\\x04') RETURNING *`, [sectionIds[0]]);
    const [meeting] = await database.query(`INSERT INTO meetings (date, begin_time, status, title_envelope)
      VALUES ('2026-10-01', '19:00', 'completed', '\\x05') RETURNING id`);
    await database.query(`INSERT INTO meeting_topics (meeting_id, topic_id, section_id, position)
      VALUES ($1, $2, $3, 1)`, [meeting.id, topic.id, sectionIds[1]]);
    topicBefore = await database.query('SELECT * FROM topics');
    appearanceBefore = await database.query('SELECT * FROM meeting_topics');
    await database.destroy();

    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({
        NODE_ENV: 'test', DEV_AUTH_BYPASS: false, AUTH_SESSION_SECRET: 'agenda-sections-tests-secret-32-characters',
      })] }),
      TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl, schema,
        entities: [User, E2eeRecoveryCeremony, AgendaSection], migrations, migrationsRun: true,
        extra: { options: `-c search_path=${schema},public` } }),
      AuthModule, AgendaSectionsModule,
    ] }).compile();
    database = module.get(DataSource);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const sessions = module.get(SessionService);
    for (const role of ['admin', 'guest'] as const) {
      const user = await database.getRepository(User).save({ email: `${role}@example.com`, firstName: role, lastName: 'Test', role, passwordHash: 'hash' });
      const session = sessions.create(user.id, user.sessionVersion);
      if (role === 'admin') token = session;
      else guestToken = session;
    }
  });

  afterAll(async () => {
    await app?.close();
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });
  const call = (method: 'get' | 'post' | 'put' | 'delete', path = '', session = token) =>
    request(app.getHttpServer())[method](`/api/agenda-sections${path}`).auth(session, { type: 'bearer' });

  it('runs historical migrations fresh and upgrades populated sections without changing references', async () => {
    const sections = (await call('get').expect(200)).body;
    expect(sections).toEqual(sectionsBefore.map(({ is_default, ...row }) => ({
      id: row.id, name: row.name, position: row.position, defaultTopicType: null,
    })));
    expect(await database.query('SELECT * FROM topics')).toEqual(topicBefore);
    expect(await database.query('SELECT * FROM meeting_topics')).toEqual(appearanceBefore);
    expect(await database.runMigrations()).toEqual([]);
  });

  it('validates assignments and prevents concurrent claims with a stable error', async () => {
    await call('post').send({ name: 'Invalid', defaultTopicType: 'other' }).expect(400);
    await call('post').send({ name: '   ' }).expect(400);
    const results = await Promise.all(sectionIds.slice(0, 2).map((id) => call('put', `/${id}`)
      .send({ name: 'Section', defaultTopicType: 'person' })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)!.body.code).toBe('AGENDA_SECTION_TYPE_CONFLICT');
    const owner = results.find((result) => result.status === 200)!.body.id;
    await call('put', `/${owner}`).send({ name: 'Owner', defaultTopicType: 'person' }).expect(200);
    await call('put', `/${owner}`).send({ name: 'Owner', defaultTopicType: null }).expect(200);
    const other = sectionIds.find((id) => id !== owner)!;
    await call('put', `/${other}`).send({ name: 'Other', defaultTopicType: 'person' }).expect(200);
    await expect(database.query('UPDATE agenda_sections SET default_topic_type = $1 WHERE id = $2', ['person', owner])).rejects.toMatchObject({ code: '23505' });
    expect(await database.query('SELECT * FROM topics')).toEqual(topicBefore);
    expect(await database.query('SELECT * FROM meeting_topics')).toEqual(appearanceBefore);
  });

  it('appends and atomically reorders, rejecting stale/invalid membership and protecting writes', async () => {
    const created = (await call('post').send({ name: 'End', defaultTopicType: 'recurring' }).expect(201)).body;
    expect(created.position).toBe(9);
    await call('put', '/order').send({ ids: sectionIds }).expect(409);
    await call('put', '/order').send({ ids: [...sectionIds, sectionIds[0]] }).expect(400);
    await call('put', '/order').send({ ids: [...sectionIds, '00000000-0000-4000-8000-000000000000'] }).expect(409);
    const ordered = [created.id, ...sectionIds].reverse();
    const response = await call('put', '/order').send({ ids: ordered }).expect(200);
    expect(response.body.map((row: any) => [row.id, row.position])).toEqual(ordered.map((id, index) => [id, index + 1]));
    await call('get', '', guestToken).expect(200);
    await call('post', '', guestToken).send({ name: 'Denied' }).expect(403);
    await call('put', '/order', guestToken).send({ ids: ordered }).expect(403);
    await call('put', `/${created.id}`, guestToken).send({ name: 'Denied' }).expect(403);
    await call('delete', `/${created.id}`, guestToken).expect(403);
    await call('delete', `/${created.id}`).expect(200);
    expect((await call('get')).body.map((row: any) => row.position)).toEqual(sectionIds.map((_, index) => index + 1));
    expect(await database.query('SELECT * FROM meeting_topics')).toEqual(appearanceBefore);
  });
});
