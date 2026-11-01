import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { DashboardModule } from '../src/dashboard/dashboard.module';
import { Meeting } from '../src/meetings/meeting.entity';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `dashboard_${process.pid}_${Date.now()}`;

describeWithPostgres('Dashboard HTTP API with PostgreSQL (e2e)', () => {
  let admin: DataSource;
  let app: INestApplication;
  let database: DataSource;
  let viewer: User;

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl,
          schema,
          entities: [User, AgendaSection, Topic, TopicUpdate, Meeting, Task],
          synchronize: true,
        }),
        DashboardModule,
      ],
    }).compile();
    app = module.createNestApplication();
    database = module.get(DataSource);
    viewer = await database.getRepository(User).save({
      email: 'dashboard-viewer@example.com',
      firstName: 'Dashboard',
      lastName: 'Viewer',
      role: 'user',
      language: 'en',
      passwordHash: null,
      archivedAt: null,
    });
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { user: viewer });
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('selects distinct open/deferred Topics by latest standalone Update, ignoring Meeting and metadata activity', async () => {
    const topics = database.getRepository(Topic);
    const updates = database.getRepository(TopicUpdate);
    const createTopic = (status = 'open') => topics.save({
      nameEnvelope: Buffer.from([1]), nameCommitRevision: '1',
      descriptionEnvelope: Buffer.from([2]), descriptionCommitRevision: '1',
      membershipProcessStatusEnvelope: Buffer.from([3]), membershipProcessStatusCommitRevision: '1',
      godparentsEnvelope: Buffer.from([4]), godparentsCommitRevision: '1',
      type: 'generic', status, responsibleUserId: viewer.id,
    });
    const standalone = async (topicId: string, date: string, type = 'update') => updates.save({
      topicId, date: new Date(date), type, textEnvelope: Buffer.from([3]), textCommitRevision: '1',
    });
    const meetingOnly = await createTopic();
    await standalone(meetingOnly.id, '2030-01-01', 'minutes');
    const metadataOnly = await createTopic();
    const older = await createTopic();
    await standalone(older.id, '2026-01-01');
    await standalone(older.id, '2030-01-01', 'minutes');
    const newer = await createTopic('deferred');
    await standalone(newer.id, '2026-01-02');
    await standalone(newer.id, '2026-01-03');
    const done = await createTopic('done');
    await standalone(done.id, '2030-01-01');
    await topics.update(older.id, { updatedAt: new Date('2031-01-01') });

    const response = await request(app.getHttpServer()).get('/api/dashboard')
      .expect(200).expect('Cache-Control', 'no-store');
    expect(response.body.recentTopics.map((topic: Topic) => topic.id)).toEqual([newer.id, older.id]);
    expect(response.body.recentTopics[0]).toMatchObject({
      status: 'deferred', responsibleUserId: viewer.id,
      protected: { nameEnvelope: 'AQ', nameCommitRevision: '1' },
    });
    expect(response.body.recentTopics[0].protected).not.toHaveProperty('descriptionEnvelope');
    expect(response.body.recentTopics.map((topic: Topic) => topic.id)).not.toContain(metadataOnly.id);

    const tied = await Promise.all(Array.from({ length: 10 }, () => createTopic()));
    for (const topic of tied) await standalone(topic.id, '2027-01-01');
    const limited = await request(app.getHttpServer()).get('/api/dashboard').expect(200);
    expect(limited.body.recentTopics.map((topic: Topic) => topic.id)).toEqual(tied.map((topic) => topic.id).sort().slice(0, 8));
  });
});
