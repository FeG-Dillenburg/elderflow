import { NotFoundException } from '@nestjs/common';
import { In, LessThan, LessThanOrEqual } from 'typeorm';
import { SCALAR_AGGREGATES, TASK_SCALAR_FIELDS } from '../e2ee/scalar-registry';
import { Meeting } from '../meetings/meeting.entity';
import { Topic } from '../topics/topic.entity';
import { Task } from './task.entity';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    manager: { transaction: jest.fn(), getRepository: jest.fn() },
  };
  const manager = { getRepository: jest.fn(() => repository) };
  const scalars = {
    assertContentUser: jest.fn(),
    validateWrite: jest.fn(),
  };
  const service = new TasksService(repository as any, scalars as any);
  const viewer = { id: 'viewer', role: 'user' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    repository.manager.transaction.mockImplementation(async (work) => work(manager));
    repository.manager.getRepository.mockImplementation(() => repository);
    repository.save.mockImplementation(async (value) => value);
  });
  afterEach(() => jest.useRealTimers());

  it.each([undefined, 'open'])('uses active task statuses for %s', async (status) => {
    repository.find.mockResolvedValue([]);
    await service.findAll({ status }, viewer);
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: In(['open', 'in_progress']) }),
      relations: { topic: true, meeting: true, assignedTo: true },
      order: { dueDate: 'ASC', createdAt: 'DESC' },
    }));
  });

  it('applies supplied structural filters without receiving Protected search text', async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll({
      status: 'done',
      assignedToId: 'user',
      topicId: 'topic',
      meetingId: 'meeting',
      dueOn: '2026-07-20',
    }, viewer);
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'done',
        assignedToId: 'user',
        topicId: 'topic',
        meetingId: 'meeting',
        dueDate: LessThanOrEqual('2026-07-20'),
      },
    }));
  });

  it('uses strict today comparison for overdue and gives it precedence', async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll({ overdue: true, dueOn: '2026-07-20' }, viewer);
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dueDate: LessThan('2026-07-15') }),
    }));
  });

  it('returns narrow encrypted Topic labels and structural Meeting references for filters', async () => {
    const topics = { find: jest.fn().mockResolvedValue([{
      id: 'topic',
      nameEnvelope: Buffer.from('topic-name'),
      nameCommitRevision: '1',
      descriptionEnvelope: Buffer.from('must-not-leak'),
    }]) };
    const meetings = { find: jest.fn().mockResolvedValue([{
      id: 'meeting',
      title: 'must-not-leak',
      date: '2026-07-20',
      beginTime: '19:30',
      status: 'planned',
      generalNotes: 'must-not-leak',
    }]) };
    repository.manager.getRepository = jest.fn((entity) => {
      if (entity === Topic) return topics;
      if (entity === Meeting) return meetings;
      return repository;
    }) as any;

    const result = await service.references(viewer);

    expect(result.topics[0]).toEqual({
      id: 'topic',
      protected: {
        nameEnvelope: Buffer.from('topic-name').toString('base64url'),
        nameCommitRevision: '1',
      },
    });
    expect(result.meetings[0]).toEqual({
      id: 'meeting',
      date: '2026-07-20',
      beginTime: '19:30',
      status: 'planned',
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('creates a Task by validating both envelopes through the shared scalar-write ledger', async () => {
    repository.findOne.mockResolvedValue(null);
    scalars.validateWrite
      .mockResolvedValueOnce({ envelope: Buffer.from('title'), commitRevision: '1', duplicate: false })
      .mockResolvedValueOnce({ envelope: Buffer.from('description'), commitRevision: '1', duplicate: false });
    const input = {
      id: '00000000-0000-4000-8000-000000000050',
      protected: {
        titleEnvelope: 'title-envelope',
        descriptionEnvelope: 'description-envelope',
      },
      assignedToId: null,
      status: 'open',
    } as any;

    const result = await service.create(input, viewer);

    expect(scalars.validateWrite).toHaveBeenNthCalledWith(1, manager, viewer, {
      aggregateType: SCALAR_AGGREGATES.task,
      recordId: input.id,
      fieldId: TASK_SCALAR_FIELDS.title.fieldId,
    }, 'title-envelope', null);
    expect(scalars.validateWrite).toHaveBeenNthCalledWith(2, manager, viewer, {
      aggregateType: SCALAR_AGGREGATES.task,
      recordId: input.id,
      fieldId: TASK_SCALAR_FIELDS.description.fieldId,
    }, 'description-envelope', null);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      titleEnvelope: Buffer.from('title'),
      titleCommitRevision: '1',
      descriptionEnvelope: Buffer.from('description'),
      descriptionCommitRevision: '1',
    }));
    expect(result.protected).toMatchObject({
      titleEnvelope: Buffer.from('title').toString('base64url'),
    });
  });

  it('updates Protected and structural fields atomically and preserves completion behavior', async () => {
    const task = {
      id: 'task',
      titleEnvelope: Buffer.from('old-title'),
      titleCommitRevision: '1',
      descriptionEnvelope: Buffer.from('old-description'),
      descriptionCommitRevision: '1',
      completedAt: null,
      status: 'open',
    } as Task;
    repository.findOne.mockResolvedValue(task);
    scalars.validateWrite.mockResolvedValue({
      envelope: Buffer.from('new-title'),
      commitRevision: '2',
      duplicate: false,
    });

    const result = await service.update('task', {
      protected: { titleEnvelope: 'new-title-envelope' },
      status: 'done',
    }, viewer);

    expect(scalars.validateWrite).toHaveBeenCalledWith(manager, viewer, {
      aggregateType: SCALAR_AGGREGATES.task,
      recordId: 'task',
      fieldId: TASK_SCALAR_FIELDS.title.fieldId,
    }, 'new-title-envelope', '1');
    expect(task.titleEnvelope).toEqual(Buffer.from('new-title'));
    expect(task.titleCommitRevision).toBe('2');
    expect(task.completedAt).toEqual(new Date('2026-07-15T10:00:00.000Z'));
    expect(result.status).toBe('done');
  });

  it('rejects a missing update target', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.update('missing', {}, viewer)).rejects.toThrow(NotFoundException);
  });
});
