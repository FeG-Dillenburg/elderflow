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
          entities: [User, AgendaSection, Topic, Meeting, Task],
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

  it('returns recent Topics ordered by their update time', async () => {
    await database.getRepository(Topic).save({
      nameEnvelope: Buffer.from([1]),
      nameCommitRevision: '1',
      descriptionEnvelope: Buffer.from([2]),
      descriptionCommitRevision: '1',
      membershipProcessStatusEnvelope: Buffer.from([3]),
      membershipProcessStatusCommitRevision: '1',
      godparentsEnvelope: Buffer.from([4]),
      godparentsCommitRevision: '1',
      type: 'generic',
      status: 'open',
      followUpDate: null,
      responsibleUserId: viewer.id,
      membershipStatusSignal: null,
      defaultSectionId: null,
      defaultPosition: null,
      recurrenceFirstDueDate: null,
      recurrenceInterval: null,
      recurrenceUnit: null,
    });

    const response = await request(app.getHttpServer())
      .get('/api/dashboard')
      .expect(200)
      .expect('Cache-Control', 'no-store');

    expect(response.body.recentTopics).toEqual([
      expect.objectContaining({
        status: 'open',
        responsibleUserId: viewer.id,
      }),
    ]);
  });
});
