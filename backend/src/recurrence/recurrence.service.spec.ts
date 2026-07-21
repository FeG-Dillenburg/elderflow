import { RecurrenceService } from './recurrence.service';
import { Topic } from '../topics/topic.entity';
import { Meeting } from '../meetings/meeting.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { SkippedRecurrence } from './skipped-recurrence.entity';

describe('RecurrenceService date arithmetic', () => {
  const service = new RecurrenceService();

  it('adds whole weeks to the actual appearance date', () => {
    expect(service.addInterval('2026-01-10', 3, 'weeks')).toBe('2026-01-31');
  });

  it('clamps calendar months to the final day of the target month', () => {
    expect(service.addInterval('2026-01-31', 1, 'months')).toBe('2026-02-28');
    expect(service.addInterval('2024-01-31', 1, 'months')).toBe('2024-02-29');
  });

  it('derives the first due date until an appearance advances cadence', () => {
    expect(service.nextDueDate({
      recurrenceFirstDueDate: '2026-03-01',
      recurrenceInterval: 2,
      recurrenceUnit: 'months',
    }, [])).toBe('2026-03-01');
  });

  it('uses the latest actual non-skipped appearance for rolling cadence', () => {
    expect(service.nextDueDate({
      recurrenceFirstDueDate: '2026-03-01',
      recurrenceInterval: 2,
      recurrenceUnit: 'months',
    }, ['2026-03-08', '2026-05-17'])).toBe('2026-07-17');
  });
});

describe('RecurrenceService reconciliation', () => {
  const service = new RecurrenceService();
  const topic = {
    id: 'topic',
    type: 'recurring',
    status: 'open',
    description: 'New template',
    defaultSectionId: 'section',
    defaultPosition: null,
    recurrenceFirstDueDate: '2026-01-01',
    recurrenceInterval: 1,
    recurrenceUnit: 'months',
  } as Topic;

  const manager = (
    meetings: Meeting[],
    appearances: MeetingTopic[],
    skips: SkippedRecurrence[] = [],
  ) => {
    const saved: MeetingTopic[] = [];
    const value = {
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Topic) return [topic];
        if (entity === Meeting) return meetings;
        if (entity === SkippedRecurrence) return skips;
        if (entity === MeetingTopic && options.where.topicId) return appearances;
        return [];
      }),
      exists: jest.fn(async () => true),
      remove: jest.fn(async () => undefined),
      create: jest.fn((_entity: unknown, input: MeetingTopic) => input),
      save: jest.fn(async (_entity: unknown, input: MeetingTopic | MeetingTopic[]) => {
        if (!Array.isArray(input)) saved.push(input);
        return input;
      }),
    };
    return { value, saved };
  };

  it('preserves the copied note when an untouched automatic appearance is reconciled', async () => {
    const meeting = { id: 'meeting', date: '2026-01-05', beginTime: '19:00', status: 'planned' } as Meeting;
    const appearance = {
      id: 'appearance',
      topicId: topic.id,
      meetingId: meeting.id,
      meeting,
      source: 'recurrence',
      noteEditedAt: null,
      agendaNote: 'Original copied description',
    } as MeetingTopic;
    const { value, saved } = manager([meeting], [appearance]);

    await service.reconcile(value as any);

    expect(saved).toContainEqual(expect.objectContaining({
      agendaNote: 'Original copied description',
      source: 'recurrence',
    }));
  });

  it('surfaces a stable conflict instead of inserting before a preserved later appearance', async () => {
    const first = { id: 'first', date: '2026-01-05', beginTime: '19:00', status: 'planned' } as Meeting;
    const later = { id: 'later', date: '2026-01-20', beginTime: '19:00', status: 'planned' } as Meeting;
    const manual = {
      id: 'manual',
      topicId: topic.id,
      meetingId: later.id,
      meeting: later,
      source: 'manual',
      noteEditedAt: null,
    } as MeetingTopic;
    const { value } = manager([first, later], [manual]);

    await expect(service.reconcile(value as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RECURRENCE_EDITED_APPEARANCE_CONFLICT' }),
    });
  });

  it('skips a due planned Meeting, schedules the next one once, and ignores active Meetings', async () => {
    const skipped = { id: 'skipped', date: '2026-01-05', beginTime: '19:00', status: 'planned' } as Meeting;
    const active = { id: 'active', date: '2026-01-10', beginTime: '19:00', status: 'in_progress' } as Meeting;
    const eligible = { id: 'eligible', date: '2026-01-20', beginTime: '19:00', status: 'planned' } as Meeting;
    const { value, saved } = manager(
      [skipped, active, eligible],
      [],
      [{ topicId: topic.id, meetingId: skipped.id } as SkippedRecurrence],
    );

    await service.reconcile(value as any);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      meetingId: eligible.id,
      topicId: topic.id,
      source: 'recurrence',
      agendaNote: 'New template',
    });
  });

  it('removes untouched future automatic appearances when a Recurring Topic is closed', async () => {
    const meeting = { id: 'meeting', date: '2026-01-05', beginTime: '19:00', status: 'planned' } as Meeting;
    const appearance = {
      id: 'appearance', topicId: topic.id, meetingId: meeting.id, meeting,
      source: 'recurrence', noteEditedAt: null,
    } as MeetingTopic;
    const closedTopic = { ...topic, status: 'done' };
    const { value, saved } = manager([meeting], [appearance]);
    value.find.mockImplementation(async (entity: unknown, options: any) => {
      if (entity === Topic) return [closedTopic];
      if (entity === Meeting) return [meeting];
      if (entity === SkippedRecurrence) return [];
      if (entity === MeetingTopic && options.where.topicId) return [appearance];
      return [];
    });

    await service.reconcile(value as any);

    expect(value.remove).toHaveBeenCalledWith(MeetingTopic, [appearance]);
    expect(saved).toHaveLength(0);
  });
});
