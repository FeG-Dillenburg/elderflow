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

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `topics_${process.pid}_${Date.now()}`;

describeWithPostgres('Topics with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: TopicsService;

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
      name: 'Original topic',
      description: null,
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

    await expect(service.update(topic.id, { name: 'Updated topic' }))
      .resolves.toMatchObject({ name: 'Updated topic' });
    await expect(service.findOne(topic.id))
      .resolves.toMatchObject({ name: 'Updated topic' });
  });

  it('persists the first eligible automatic appearance when a Recurring Topic is created', async () => {
    const section = await database.getRepository(AgendaSection).save({
      name: 'Reports',
      position: 1,
      isDefault: true,
    });
    const meeting = await database.getRepository(Meeting).save({
      title: null,
      date: '2026-08-10',
      beginTime: '19:00',
      status: 'planned',
      meetingLeaderId: null,
      minuteTakerId: null,
      generalNotes: null,
      openingInput: null,
    });

    const topic = await service.create({
      name: 'Quarterly review',
      description: 'Use this preparation checklist',
      type: 'recurring',
      status: 'open',
      followUpDate: null,
      responsibleUserId: null,
      defaultSectionId: section.id,
      defaultPosition: null,
      recurrenceFirstDueDate: '2026-08-01',
      recurrenceInterval: 3,
      recurrenceUnit: 'months',
    });

    await expect(database.getRepository(MeetingTopic).findOneByOrFail({
      meetingId: meeting.id,
      topicId: topic.id,
    })).resolves.toMatchObject({
      source: 'recurrence',
      agendaNote: 'Use this preparation checklist',
      noteEditedAt: null,
    });
  });
});
