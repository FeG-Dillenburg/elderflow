import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { Topic } from '../src/topics/topic.entity';
import { TopicHistoryService } from '../src/topics/topic-history.service';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { TopicsController } from '../src/topics/topics.controller';
import { TopicsService } from '../src/topics/topics.service';

const TOPIC_ID = '00000000-0000-4000-8000-000000000001';
const MEETING_ID = '00000000-0000-4000-8000-000000000002';

describe('Topic history contract (e2e)', () => {
  const topics = { findOne: jest.fn() };
  const updates = { find: jest.fn() };
  const appearances = { find: jest.fn() };
  const skippedRecurrences = { find: jest.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TopicsController],
      providers: [
        TopicHistoryService,
        { provide: TopicsService, useValue: {} },
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
        { provide: getRepositoryToken(SkippedRecurrence), useValue: skippedRecurrences },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((request_: any, _response: any, next: () => void) => {
      request_.user = { id: 'viewer', role: 'user' };
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    updates.find.mockResolvedValue([{
      id: '00000000-0000-4000-8000-000000000010',
      topicId: TOPIC_ID,
      meetingId: MEETING_ID,
      date: new Date('2026-07-15T18:10:00Z'),
      text: '<p>Recorded minutes</p>',
      createdBy: null,
    }]);
    skippedRecurrences.find.mockResolvedValue([]);
  });

  it.each([
    ['generic', 'Generic Topic'],
    ['person', 'Person Topic'],
    ['new_membership', 'Membership Topic'],
    ['recurring', 'Recurring Topic'],
  ])('serializes a grouped %s Topic history', async (type, _name) => {
    topics.findOne.mockResolvedValue({
      id: TOPIC_ID,
      type,
      nameEnvelope: Buffer.from([1]),
      nameCommitRevision: '1',
      membershipProcessStatusEnvelope: Buffer.from([2]),
      membershipProcessStatusCommitRevision: '1',
      godparentsEnvelope: Buffer.from([3]),
      godparentsCommitRevision: '1',
      responsibleUser: null,
      membershipStatusSignal: type === 'new_membership' ? 'attention' : null,
    });
    appearances.find.mockResolvedValue([{
      id: '00000000-0000-4000-8000-000000000003',
      meetingId: MEETING_ID,
      meeting: {
        id: MEETING_ID,
        title: 'Council',
        date: '2026-07-15',
        beginTime: '20:00:00',
        status: 'completed',
      },
      section: null,
      agendaNote: '<p>Appearance note</p>',
      topicNameSnapshotEnvelope: Buffer.from([11]),
      topicNameSnapshotCommitRevision: '4',
      responsibleUserDisplayNameSnapshot: 'Recorded owner',
      membershipProcessStatusSnapshotEnvelope: Buffer.from([12]),
      membershipProcessStatusSnapshotCommitRevision: '5',
      membershipStatusSignalSnapshot: type === 'new_membership' ? 'nearly_finished' : null,
      godparentsSnapshotEnvelope: Buffer.from([13]),
      godparentsSnapshotCommitRevision: '6',
    }]);

    const response = await request(app.getHttpServer())
      .get(`/api/topics/${TOPIC_ID}/history`)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      kind: 'meeting_appearance',
      meeting: expect.objectContaining({ id: MEETING_ID, status: 'completed' }),
      meetingDocumentUnavailable: true,
      topic: expect.objectContaining({
        type,
        protected: expect.objectContaining({
          nameEnvelope: 'Cw',
          membershipProcessStatusEnvelope: 'DA',
          godparentsEnvelope: 'DQ',
        }),
        protectedUnavailable: false,
      }),
      meetingMinutes: type === 'person'
        ? null
        : expect.objectContaining({ protectedUnavailable: true }),
      legacyMinutesEntries: type === 'person'
        ? [expect.objectContaining({ protectedUnavailable: true })]
        : [],
    })]);
    if (type === 'new_membership') {
      expect(response.body[0].topic).toMatchObject({
        membershipStatusSignal: 'nearly_finished',
      });
    }
  });
});
