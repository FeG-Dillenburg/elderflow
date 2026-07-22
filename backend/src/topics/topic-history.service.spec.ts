import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { Topic } from './topic.entity';
import { TopicHistoryService } from './topic-history.service';
import { TopicUpdate } from './topic-update.entity';

describe('TopicHistoryService', () => {
  const topics = { findOne: jest.fn() };
  const updates = { find: jest.fn() };
  const appearances = { find: jest.fn() };
  const skippedRecurrences = { find: jest.fn() };
  let service: TopicHistoryService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TopicHistoryService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
        { provide: getRepositoryToken(SkippedRecurrence), useValue: skippedRecurrences },
      ],
    }).compile();
    service = module.get(TopicHistoryService);
    topics.findOne.mockResolvedValue({
      id: 'topic',
      type: 'generic',
      name: 'Live topic',
      responsibleUser: { firstName: 'Live', lastName: 'Owner' },
    });
    updates.find.mockResolvedValue([]);
    appearances.find.mockResolvedValue([]);
    skippedRecurrences.find.mockResolvedValue([]);
  });

  it('returns mixed top-level history newest first with deterministic ties', async () => {
    topics.findOne.mockResolvedValue({
      id: 'topic',
      type: 'recurring',
      name: 'Live topic',
      responsibleUser: null,
    });
    updates.find.mockResolvedValue([
      { id: 'update-z', meetingId: null, date: new Date('2026-07-15T19:30:00'), text: 'Middle' },
      { id: 'update-a', meetingId: null, date: new Date('2026-07-15T20:00:00'), text: 'Same time' },
    ]);
    appearances.find.mockResolvedValue([{
      id: 'appearance',
      meetingId: 'meeting',
      meeting: { id: 'meeting', date: '2026-07-15', beginTime: '20:00:00', status: 'planned', title: 'Council' },
      section: { id: 'section', name: 'Main' },
      agendaNote: 'Context',
    }]);
    skippedRecurrences.find.mockResolvedValue([{
      id: 'skip',
      meetingId: 'early',
      meeting: { id: 'early', date: '2026-07-15', beginTime: '18:00:00', status: 'planned', title: null },
    }]);

    await expect(service.getHistory('topic')).resolves.toMatchObject([
      { id: 'meeting-appearance:appearance', kind: 'meeting_appearance' },
      { id: 'standalone-update:update-a', kind: 'standalone_update' },
      { id: 'standalone-update:update-z', kind: 'standalone_update' },
      { id: 'skipped-recurrence:skip', kind: 'skipped_recurrence' },
    ]);
  });

  it('groups Meeting Minutes chronologically after appearance context', async () => {
    updates.find.mockResolvedValue([
      { id: 'late', meetingId: 'meeting', date: new Date('2026-07-15T20:15:00Z'), text: 'Second', createdBy: null },
      { id: 'early', meetingId: 'meeting', date: new Date('2026-07-15T20:05:00Z'), text: 'First', createdBy: { firstName: 'Ada', lastName: 'Lovelace' } },
    ]);
    appearances.find.mockResolvedValue([{
      id: 'appearance',
      meetingId: 'meeting',
      meeting: { id: 'meeting', date: '2026-07-15', beginTime: '20:00:00', status: 'in_progress', title: 'Council' },
      section: null,
      agendaNote: 'Preparation context',
    }]);

    const [entry] = await service.getHistory('topic');

    expect(entry).toMatchObject({
      kind: 'meeting_appearance',
      note: 'Preparation context',
      topic: { name: 'Live topic', responsibleUserDisplayName: 'Live Owner' },
      minutes: [
        { id: 'early', text: 'First', createdByDisplayName: 'Ada Lovelace' },
        { id: 'late', text: 'Second', createdByDisplayName: null },
      ],
    });
  });

  it('uses preserved New membership values for completed Meetings', async () => {
    topics.findOne.mockResolvedValue({
      id: 'topic',
      type: 'new_membership',
      name: 'Live name',
      membershipProcessStatus: 'Live status',
      membershipStatusSignal: 'attention',
      godparents: 'Live godparents',
      responsibleUser: { firstName: 'Live', lastName: 'Owner' },
    });
    appearances.find.mockResolvedValue([{
      id: 'appearance',
      meetingId: 'meeting',
      meeting: { id: 'meeting', date: '2026-07-15', beginTime: '20:00:00', status: 'completed', title: null },
      topicNameSnapshot: 'Recorded name',
      responsibleUserDisplayNameSnapshot: 'Recorded owner',
      membershipProcessStatusSnapshot: 'Recorded status',
      membershipStatusSignalSnapshot: 'nearly_finished',
      godparentsSnapshot: 'Recorded godparents',
    }]);

    await expect(service.getHistory('topic')).resolves.toMatchObject([{
      topic: {
        name: 'Recorded name',
        responsibleUserDisplayName: 'Recorded owner',
        membershipProcessStatus: 'Recorded status',
        membershipStatusSignal: 'nearly_finished',
        godparents: 'Recorded godparents',
      },
    }]);
  });

  it('returns an empty collection and preserves the stable missing-Topic error', async () => {
    await expect(service.getHistory('topic')).resolves.toEqual([]);
    topics.findOne.mockResolvedValue(null);
    await expect(service.getHistory('missing')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TOPIC_NOT_FOUND' }),
    });
  });
});
