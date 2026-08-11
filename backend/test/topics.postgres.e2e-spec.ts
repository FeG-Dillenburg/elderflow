import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { TopicsService } from '../src/topics/topics.service';
import { User } from '../src/users/user.entity';
import { RecurrenceService } from '../src/recurrence/recurrence.service';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { E2eeScalarService } from '../src/e2ee/e2ee-scalar.service';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `topics_${process.pid}_${Date.now()}`;

describeWithPostgres('Topics with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: TopicsService;
  const viewer = { id: '00000000-0000-4000-8000-000000000099', role: 'user' } as User;
  const scalars = {
    assertContentUser: jest.fn(),
    validateWrite: jest.fn(async (_manager, _user, context) => ({
      envelope: Buffer.from([context.fieldId]),
      commitRevision: '1',
      duplicate: false,
    })),
  } as unknown as E2eeScalarService;

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [User, AgendaSection, Topic, TopicUpdate, Meeting, MeetingUser, MeetingTopic, Task, SkippedRecurrence],
      synchronize: true,
    });
    await database.initialize();
    service = new TopicsService(
      database.getRepository(Topic),
      database.getRepository(TopicUpdate),
      database.getRepository(MeetingTopic),
      new RecurrenceService(),
      scalars,
    );
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('updates a Topic whose optional relations are not assigned', async () => {
    const topic = await database.getRepository(Topic).save({
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
      responsibleUserId: null,
      defaultSectionId: null,
      defaultPosition: null,
      recurrenceFirstDueDate: null,
      recurrenceInterval: null,
      recurrenceUnit: null,
    });

    await expect(service.update(topic.id, {
      protected: { nameEnvelope: 'opaque' },
    } as any, viewer)).resolves.toMatchObject({
      protected: expect.objectContaining({ nameEnvelope: 'AQ' }),
    });
    await expect(service.findOne(topic.id, viewer)).resolves.toMatchObject({
      protected: expect.objectContaining({ nameEnvelope: 'AQ' }),
    });
  });

  it('does not create a Recurring Topic appearance without a client-authored encrypted fragment', async () => {
    const section = await database.getRepository(AgendaSection).save({
      name: 'Reports',
      position: 1,
      isDefault: true,
    });
    const meeting = await database.getRepository(Meeting).save({
      titleEnvelope: Buffer.from([1]),
      titleCommitRevision: '1',
      date: '2026-08-10',
      beginTime: '19:00',
      status: 'planned',
      meetingLeaderId: null,
      minuteTakerId: null,
    });

    const topic = await service.create({
      id: '00000000-0000-4000-8000-000000000010',
      type: 'recurring',
      status: 'open',
      followUpDate: null,
      responsibleUserId: null,
      defaultSectionId: section.id,
      defaultPosition: null,
      recurrenceFirstDueDate: '2026-08-01',
      recurrenceInterval: 3,
      recurrenceUnit: 'months',
      protected: {
        nameEnvelope: 'one',
        descriptionEnvelope: 'two',
        membershipProcessStatusEnvelope: 'three',
        godparentsEnvelope: 'four',
      },
    } as any, viewer);

    await expect(database.getRepository(MeetingTopic).findOneBy({
      meetingId: meeting.id,
      topicId: topic.id,
    })).resolves.toBeNull();
  });
});
