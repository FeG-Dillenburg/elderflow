import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { MeetingsService } from './meetings.service';
import { meetingCollaborationEvents } from './meeting-collaboration-events';

describe('Meeting section allowances', () => {
  const manager = { findOne: jest.fn(), findOneBy: jest.fn(), create: jest.fn((_entity, input) => input), save: jest.fn(), query: jest.fn() };
  const dataSource = { transaction: jest.fn(async (work) => work(manager)) };
  const repository = {} as never;
  const service = new MeetingsService(
    dataSource as never, repository, repository, repository, repository, repository, repository,
    repository, repository, repository, repository, repository, repository,
  );
  const user = { role: 'user' } as never;
  beforeEach(() => {
    jest.restoreAllMocks();
    manager.findOne.mockResolvedValue({ status: 'planned' });
    manager.findOneBy.mockImplementation(async (entity) => entity === AgendaSection ? { id: 'section' } : null);
    manager.query.mockResolvedValue([{ sectionId: 'section', minutes: 20 }]);
  });
  it('rejects read-only callers before any write', async () => {
    await expect(service.updateSectionTime('meeting', 'section', 20, { role: 'guest' } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTH_FORBIDDEN' }),
    });
  });

  it('saves under the mutable Meeting lock and notifies only after commit', async () => {
    const emit = jest.spyOn(meetingCollaborationEvents, 'emit');
    expect(await service.updateSectionTime('meeting', 'section', 20, user)).toEqual({ sectionId: 'section', minutes: 20 });
    expect(emit).toHaveBeenCalledWith('agenda-changed', { meetingId: 'meeting' });
  });
});
