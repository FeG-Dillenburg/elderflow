import { randomUUID } from 'node:crypto';
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
import { SectionTime1720000027000 } from '../src/database/migrations/1720000027000-SectionTime';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { MeetingSectionTime } from '../src/meetings/meeting-section-time.entity';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { MeetingsService } from '../src/meetings/meetings.service';
import { MeetingsController } from '../src/meetings/meetings.controller';
import { MeetingCollaborationTicketService } from '../src/meetings/meeting-collaboration-ticket.service';
import { meetingCollaborationEvents } from '../src/meetings/meeting-collaboration-events';
import { Task } from '../src/tasks/task.entity';
import { Topic } from '../src/topics/topic.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgres = databaseUrl ? describe : describe.skip;
const schema = `section_time_${process.pid}_${Date.now()}`;

postgres('Section time API and existing-data upgrade', () => {
  let admin: DataSource;
  let database: DataSource;
  let app: INestApplication;
  let service: MeetingsService;
  let token: string;
  let guestToken: string;
  let user: User;
  let sectionId: string;
  let completedId: string;
  let plannedId: string;
  let before: Record<string, unknown[]>;
  const documents = { assertContentUser: jest.fn(), createInitial: jest.fn(), bootstrap: jest.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url: databaseUrl }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = await new DataSource({ type: 'postgres', url: databaseUrl, schema,
      migrations: migrations.filter((migration) => migration !== SectionTime1720000027000),
      extra: { options: `-c search_path=${schema},public` } }).initialize();
    await database.runMigrations();
    const [section] = await database.query(`INSERT INTO agenda_sections (name, position) VALUES ('People', 1) RETURNING id`);
    sectionId = section.id;
    const rows = await database.query(`INSERT INTO meetings (date, begin_time, status, title_envelope)
      VALUES ('2026-10-01', '23:45', 'completed', '\\x05'), ('2026-10-02', '19:30', 'planned', '\\x06') RETURNING id`);
    [completedId, plannedId] = rows.map((row: any) => row.id);
    const [topic] = await database.query(`INSERT INTO topics
      (type, default_section_id, name_envelope, description_envelope, membership_process_status_envelope, godparents_envelope)
      VALUES ('generic', $1, '\\x01', '\\x02', '\\x03', '\\x04') RETURNING id`, [sectionId]);
    await database.query(`INSERT INTO meeting_topics (meeting_id, topic_id, section_id, position, planned_duration)
      VALUES ($1, $2, $3, 1, 15)`, [completedId, topic.id, sectionId]);
    before = {};
    for (const table of ['meetings', 'topics', 'meeting_topics']) before[table] = await database.query(`SELECT * FROM ${table} ORDER BY id`);
    await database.destroy();

    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({
        NODE_ENV: 'test', DEV_AUTH_BYPASS: false, AUTH_SESSION_SECRET: 'section-time-tests-secret-32-characters',
      })] }),
      TypeOrmModule.forRoot({ type: 'postgres', url: databaseUrl, schema,
        entities: [User, E2eeRecoveryCeremony, AgendaSection, Meeting, MeetingSectionTime, MeetingTopic, MeetingUser, Topic, TopicUpdate, Task, SkippedRecurrence],
        migrations, migrationsRun: true, extra: { options: `-c search_path=${schema},public` } }),
      AuthModule, AgendaSectionsModule,
    ], controllers: [MeetingsController], providers: [
      { provide: MeetingsService, inject: [DataSource], useFactory: (db: DataSource) => new MeetingsService(
        db, db.getRepository(Meeting), db.getRepository(MeetingUser), db.getRepository(MeetingTopic),
        db.getRepository(Topic), db.getRepository(TopicUpdate), db.getRepository(Task), db.getRepository(AgendaSection),
        {} as never, {} as never,
        { validateWrite: async () => ({ envelope: Buffer.from([7]), commitRevision: '1' }) } as never,
        documents as never, {} as never,
      ) },
      { provide: MeetingCollaborationTicketService, useValue: {} },
    ] }).compile();
    database = module.get(DataSource);
    service = module.get(MeetingsService);
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    for (const role of ['admin', 'guest'] as const) {
      const saved = await database.getRepository(User).save({ email: `${role}@example.com`, firstName: role, lastName: 'Test', role, passwordHash: 'hash' });
      const session = module.get(SessionService).create(saved.id, saved.sessionVersion);
      if (role === 'admin') { token = session; user = saved; }
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

  const put = (meetingId: string, minutes: unknown, session = token) => request(app.getHttpServer())
    .put(`/api/meetings/${meetingId}/section-times/${sectionId}`).auth(session, { type: 'bearer' }).send({ minutes });
  const create = (id: string = randomUUID()) => service.create({
    id, date: '2026-11-14', beginTime: '19:30', status: 'planned',
    protected: { titleEnvelope: 'test' }, document: {},
  } as never, user);

  it('runs the historical fresh installation then upgrades existing and Completed Meetings without changing data', async () => {
    for (const table of Object.keys(before)) expect(await database.query(`SELECT * FROM ${table} ORDER BY id`)).toEqual(before[table]);
    expect((await database.getRepository(AgendaSection).findOneByOrFail({ id: sectionId })).defaultMinutes).toBe(0);
    expect((await service.findOne(completedId, user)).sectionTimes).toEqual([]);
    expect((await service.findOne(completedId, user)).agenda[0].plannedDuration).toBe(15);
    expect(await database.runMigrations()).toEqual([]);
  });

  it('supports a fresh installation and validates configuration defaults through the API', async () => {
    const freshSchema = `${schema}_fresh`;
    await admin.query(`CREATE SCHEMA "${freshSchema}"`);
    const fresh = await new DataSource({ type: 'postgres', url: databaseUrl, schema: freshSchema,
      migrations, extra: { options: `-c search_path=${freshSchema},public` } }).initialize();
    try {
      await fresh.runMigrations();
      expect(await fresh.query('SELECT * FROM meeting_section_times')).toEqual([]);
      expect((await fresh.query('SELECT default_minutes FROM agenda_sections')).every((row: any) => row.default_minutes === 0)).toBe(true);
    } finally {
      await fresh.destroy();
      await admin.query(`DROP SCHEMA "${freshSchema}" CASCADE`);
    }
    const section = (await database.getRepository(AgendaSection).findOneByOrFail({ id: sectionId }));
    const update = (defaultMinutes: unknown) => request(app.getHttpServer()).put(`/api/agenda-sections/${sectionId}`)
      .auth(token, { type: 'bearer' }).send({ name: section.name, defaultMinutes });
    for (const invalid of [-1, 2.5, null, '20', 2147483648]) await update(invalid).expect(400);
    expect((await update(17).expect(200)).body.defaultMinutes).toBe(17);
  });

  it('captures defaults once, including empty sections, and never propagates later defaults or overrides', async () => {
    await database.getRepository(AgendaSection).update(sectionId, { defaultMinutes: 20 });
    const first = await create();
    expect((await service.findOne(first.id, user)).sectionTimes).toHaveLength(await database.getRepository(AgendaSection).count());
    expect((await service.findOne(first.id, user)).sectionTimes).toContainEqual({ sectionId, minutes: 20 });
    await put(first.id, 35).expect(200);
    await database.getRepository(AgendaSection).update(sectionId, { defaultMinutes: 45 });
    const second = await create();
    expect((await service.findOne(first.id, user)).sectionTimes.filter((time: any) => time.minutes > 0)).toEqual([{ sectionId, minutes: 35 }]);
    expect((await service.findOne(second.id, user)).sectionTimes.filter((time: any) => time.minutes > 0)).toEqual([{ sectionId, minutes: 45 }]);
    expect((await service.findOne(plannedId, user)).sectionTimes).toEqual([]);
    expect((await service.findOne(completedId, user)).sectionTimes).toEqual([]);
    await expect(create(first.id)).rejects.toThrow();
    expect((await service.findOne(first.id, user)).sectionTimes.filter((time: any) => time.minutes > 0)).toEqual([{ sectionId, minutes: 35 }]);
    const later = await database.getRepository(AgendaSection).save({ name: 'Later', position: 2, defaultMinutes: 60 });
    expect((await service.findOne(first.id, user)).sectionTimes).not.toContainEqual(expect.objectContaining({ sectionId: later.id }));
    const failedId = randomUUID();
    documents.createInitial.mockRejectedValueOnce(new Error('document rejected'));
    await expect(create(failedId)).rejects.toThrow('document rejected');
    expect(await database.getRepository(Meeting).findOneBy({ id: failedId })).toBeNull();
    expect(await database.getRepository(MeetingSectionTime).countBy({ meetingId: failedId })).toBe(0);
  });

  it('validates API writes, protects history, and notifies workspaces only for committed saves', async () => {
    const emit = jest.spyOn(meetingCollaborationEvents, 'emit');
    for (const invalid of [-1, 1.5, 2147483648, null, '20']) await put(plannedId, invalid).expect(400);
    await put(plannedId, 20, guestToken).expect(403);
    await put(completedId, 20).expect(409);
    expect(emit).not.toHaveBeenCalled();
    expect((await put(plannedId, 17).expect(200)).body).toEqual({ sectionId, minutes: 17 });
    expect(emit).toHaveBeenCalledWith('agenda-changed', { meetingId: plannedId });
    await expect(database.query('INSERT INTO meeting_section_times (meeting_id, section_id, minutes) VALUES ($1, $2, 10)', [plannedId, sectionId])).rejects.toMatchObject({ code: '23505' });
    await expect(database.query('UPDATE meeting_section_times SET minutes = -1 WHERE meeting_id = $1', [plannedId])).rejects.toMatchObject({ code: '23514' });
    await expect(database.getRepository(AgendaSection).delete(sectionId)).rejects.toMatchObject({ code: '23503' });
    await put(plannedId, 0).expect(200);
    expect((await service.findOne(plannedId, user)).sectionTimes).toEqual([{ sectionId, minutes: 0 }]);
    emit.mockRestore();
  });
});
