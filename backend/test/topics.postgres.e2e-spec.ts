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
      entities: [User, AgendaSection, Topic, TopicUpdate, Meeting, MeetingUser, MeetingTopic, Task],
      synchronize: true,
    });
    await database.initialize();
    service = new TopicsService(
      database.getRepository(Topic),
      database.getRepository(TopicUpdate),
      database.getRepository(MeetingTopic),
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
      isRecurring: false,
      defaultSectionId: null,
      defaultPosition: null,
    });

    await expect(service.update(topic.id, { name: 'Updated topic' }))
      .resolves.toMatchObject({ name: 'Updated topic' });
    await expect(service.findOne(topic.id))
      .resolves.toMatchObject({ name: 'Updated topic' });
  });
});
