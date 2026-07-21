import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { MeetingSnapshotRegistry } from '../src/meetings/meeting-snapshot-contributor';
import { MeetingsService } from '../src/meetings/meetings.service';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `meeting_completion_${process.pid}_${Date.now()}`;

describeWithPostgres('Meeting completion with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: MeetingsService;
  let snapshots: MeetingSnapshotRegistry;
  let leader: User;
  let meeting: Meeting;
  let appearance: MeetingTopic;

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
    snapshots = new MeetingSnapshotRegistry();
    service = new MeetingsService(
      database,
      database.getRepository(Meeting),
      database.getRepository(MeetingUser),
      database.getRepository(MeetingTopic),
      database.getRepository(Topic),
      database.getRepository(TopicUpdate),
      database.getRepository(Task),
      database.getRepository(AgendaSection),
      snapshots,
    );
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    await database.query(`
      TRUNCATE TABLE
        "${schema}"."topic_updates",
        "${schema}"."tasks",
        "${schema}"."meeting_topics",
        "${schema}"."meeting_users",
        "${schema}"."topics",
        "${schema}"."meetings",
        "${schema}"."agenda_sections",
        "${schema}"."users"
      CASCADE
    `);
    leader = await database.getRepository(User).save({
      email: 'leader@example.com',
      firstName: 'Meeting',
      lastName: 'Leader',
      role: 'user',
      language: null,
      passwordHash: null,
      archivedAt: null,
    });
    const responsible = await database.getRepository(User).save({
      email: 'responsible@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'user',
      language: null,
      passwordHash: null,
      archivedAt: null,
    });
    const section = await database.getRepository(AgendaSection).save({
      name: 'Main',
      position: 1,
      isDefault: true,
    });
    const topic = await database.getRepository(Topic).save({
      name: 'Recorded topic',
      description: null,
      type: 'generic',
      status: 'open',
      followUpDate: null,
      responsibleUserId: responsible.id,
      isRecurring: false,
      defaultSectionId: section.id,
      defaultPosition: 1,
    });
    meeting = await database.getRepository(Meeting).save({
      title: null,
      date: '2026-07-19',
      beginTime: '19:30',
      status: 'in_progress',
      meetingLeaderId: leader.id,
      minuteTakerId: null,
      generalNotes: null,
      openingInput: null,
    });
    appearance = await database.getRepository(MeetingTopic).save({
      meetingId: meeting.id,
      topicId: topic.id,
      sectionId: section.id,
      position: 1,
      agendaNote: null,
      plannedDuration: 15,
      status: 'planned',
      topicNameSnapshot: null,
      responsibleUserDisplayNameSnapshot: null,
    });
  });

  it('rolls back snapshots and status as one real transaction', async () => {
    jest.spyOn(snapshots, 'apply').mockRejectedValueOnce(new Error('snapshot failed'));

    await expect(service.complete(meeting.id, leader)).rejects.toThrow('snapshot failed');

    await expect(database.getRepository(Meeting).findOneByOrFail({ id: meeting.id }))
      .resolves.toMatchObject({ status: 'in_progress' });
    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({
        topicNameSnapshot: null,
        responsibleUserDisplayNameSnapshot: null,
      });
  });

  it('persists historical snapshots once and rejects a stale completion', async () => {
    await service.complete(meeting.id, leader);

    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({
        topicNameSnapshot: 'Recorded topic',
        responsibleUserDisplayNameSnapshot: 'Ada Lovelace',
      });
    await expect(service.complete(meeting.id, leader)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEETING_COMPLETION_INVALID_STATUS' }),
    });
  });

  it('serializes completion against a concurrent Meeting-owned mutation', async () => {
    let releaseSnapshot!: () => void;
    let snapshotStarted!: () => void;
    const started = new Promise<void>((resolve) => { snapshotStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    jest.spyOn(snapshots, 'apply').mockImplementationOnce(async () => {
      snapshotStarted();
      await blocked;
    });

    const completion = service.complete(meeting.id, leader);
    await started;
    const mutation = service.updateTopic(meeting.id, appearance.id, {
      sectionId: appearance.sectionId,
      position: appearance.position,
      plannedDuration: appearance.plannedDuration,
      status: appearance.status,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseSnapshot();

    await expect(completion).resolves.toMatchObject({ status: 'completed' });
    await expect(mutation).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEETING_COMPLETED_IMMUTABLE' }),
    });
    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({ agendaNote: null, topicNameSnapshot: 'Recorded topic' });
  });
});
