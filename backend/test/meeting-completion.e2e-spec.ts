import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { MeetingSnapshotRegistry } from '../src/meetings/meeting-snapshot-contributor';
import { MeetingsController } from '../src/meetings/meetings.controller';
import { MeetingsService } from '../src/meetings/meetings.service';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { TopicsController } from '../src/topics/topics.controller';
import { TopicsService } from '../src/topics/topics.service';
import { RecurrenceService } from '../src/recurrence/recurrence.service';

const MEETING_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const TOPIC_ID = '00000000-0000-4000-8000-000000000003';
const SECTION_ID = '00000000-0000-4000-8000-000000000004';
const APPEARANCE_ID = '00000000-0000-4000-8000-000000000005';

describe('Meeting completion lifecycle (e2e)', () => {
  let app: INestApplication;
  let snapshots: MeetingSnapshotRegistry;
  const lockQueries: Array<Record<string, unknown>> = [];
  const state: { meeting: any; appearances: any[] } = {
    meeting: null,
    appearances: [],
  };

  const dataSource = {
    transaction: jest.fn(async (work: (manager: any) => Promise<unknown>) => {
      const draft = {
        meeting: structuredClone(state.meeting),
        appearances: structuredClone(state.appearances),
      };
      const manager = {
        findOne: jest.fn(async (entity: any, options: Record<string, unknown>) => {
          if (entity === Meeting) {
            lockQueries.push(options);
            return draft.meeting;
          }
          if (entity === Topic) {
            return { id: TOPIC_ID, name: 'Recorded topic', responsibleUser: null };
          }
          return null;
        }),
        find: jest.fn(async (entity: any) => entity === MeetingTopic ? draft.appearances : []),
        findOneBy: jest.fn(),
        create: jest.fn((_entity: any, value: unknown) => value),
        save: jest.fn(async (_entity: any, value: unknown) => value),
        delete: jest.fn(),
        getRepository: jest.fn((entity: any) => entity === Topic
          ? { findOne: jest.fn().mockResolvedValue({ id: TOPIC_ID }) }
          : {
              create: jest.fn((value: unknown) => value),
              save: jest.fn(async (value: unknown) => value),
            }),
      };
      const result = await work(manager);
      state.meeting = draft.meeting;
      state.appearances = draft.appearances;
      return result;
    }),
  };
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const topicsRepository = { ...repository, manager: dataSource };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MeetingsController, TopicsController],
      providers: [
        MeetingSnapshotRegistry,
        MeetingsService,
        TopicsService,
        { provide: RecurrenceService, useValue: { reconcile: jest.fn(), nextDueDate: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Meeting), useValue: repository },
        { provide: getRepositoryToken(MeetingUser), useValue: repository },
        { provide: getRepositoryToken(MeetingTopic), useValue: repository },
        { provide: getRepositoryToken(Topic), useValue: topicsRepository },
        { provide: getRepositoryToken(TopicUpdate), useValue: repository },
        { provide: getRepositoryToken(Task), useValue: repository },
        { provide: getRepositoryToken(AgendaSection), useValue: repository },
      ],
    }).compile();
    snapshots = module.get(MeetingSnapshotRegistry);
    app = module.createNestApplication({ logger: false });
    app.use((request_: any, _response: any, next: () => void) => {
      request_.user = { id: USER_ID };
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    lockQueries.length = 0;
    state.meeting = {
      id: MEETING_ID,
      status: 'in_progress',
      meetingLeaderId: USER_ID,
      minuteTakerId: null,
    };
    state.appearances = [{
      id: APPEARANCE_ID,
      meetingId: MEETING_ID,
      topicId: TOPIC_ID,
      topicNameSnapshot: null,
      responsibleUserDisplayNameSnapshot: null,
      topic: {
        id: TOPIC_ID,
        name: 'Recorded topic',
        responsibleUser: { firstName: 'Ada', lastName: 'Lovelace' },
      },
    }];
  });

  it('rolls back snapshots and status together when completion fails', async () => {
    jest.spyOn(snapshots, 'apply').mockRejectedValueOnce(new Error('snapshot failed'));

    await request(app.getHttpServer())
      .post(`/api/meetings/${MEETING_ID}/complete`)
      .expect(500);

    expect(state.meeting.status).toBe('in_progress');
    expect(state.appearances[0].topicNameSnapshot).toBeNull();
  });

  it('atomically snapshots and completes once using a pessimistic Meeting lock', async () => {
    await request(app.getHttpServer())
      .post(`/api/meetings/${MEETING_ID}/complete`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('completed'));

    expect(state.meeting.status).toBe('completed');
    expect(state.appearances[0]).toMatchObject({
      topicNameSnapshot: 'Recorded topic',
      responsibleUserDisplayNameSnapshot: 'Ada Lovelace',
    });
    expect(lockQueries).toContainEqual(expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
    }));

    await request(app.getHttpServer())
      .post(`/api/meetings/${MEETING_ID}/complete`)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('MEETING_COMPLETION_INVALID_STATUS'));
  });

  it.each([
    ['put', `/api/meetings/${MEETING_ID}`, {}],
    ['post', `/api/meetings/${MEETING_ID}/participants`, { userId: USER_ID, attendanceStatus: 'present' }],
    ['delete', `/api/meetings/${MEETING_ID}/participants/${USER_ID}`, undefined],
    ['post', `/api/meetings/${MEETING_ID}/topics`, { topicId: TOPIC_ID, sectionId: SECTION_ID }],
    ['put', `/api/meetings/${MEETING_ID}/topics/order`, { items: [] }],
    ['put', `/api/meetings/${MEETING_ID}/topics/${APPEARANCE_ID}`, { agendaNote: 'late' }],
    ['delete', `/api/meetings/${MEETING_ID}/topics/${APPEARANCE_ID}`, undefined],
    ['post', `/api/topics/${TOPIC_ID}/updates`, { text: 'late', type: 'minute', meetingId: MEETING_ID }],
  ])('rejects completed-Meeting mutation through %s %s', async (method, path, body) => {
    state.meeting.status = 'completed';
    const operation = request(app.getHttpServer())[method as 'put'](path);
    if (body) operation.send(body);

    await operation
      .expect(409)
      .expect(({ body: responseBody }) => {
        expect(responseBody.code).toBe('MEETING_COMPLETED_IMMUTABLE');
      });
  });
});
