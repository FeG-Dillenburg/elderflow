import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgendaSectionsService } from './agenda-sections.service';
import { AgendaSection } from './agenda-section.entity';

describe('AgendaSectionsService', () => {
  let rows: AgendaSection[];
  const repository = {
    find: jest.fn(async () => rows.map((row) => ({ ...row })).sort((a, b) => a.position - b.position)),
    create: jest.fn((input) => ({ id: 'created', ...input })),
    save: jest.fn(async (input) => {
      for (const row of Array.isArray(input) ? input : [input]) {
        rows = [...rows.filter((existing) => existing.id !== row.id), { ...row }];
      }
      return input;
    }),
    delete: jest.fn(async (id) => {
      const affected = rows.some((row) => row.id === id) ? 1 : 0;
      rows = rows.filter((row) => row.id !== id);
      return { affected };
    }),
    manager: { transaction: jest.fn() },
  };
  const service = new AgendaSectionsService(repository as any);
  beforeEach(() => {
    jest.clearAllMocks();
    rows = [
      { id: 'a', name: 'Opening', position: 3, defaultTopicType: 'person' },
      { id: 'b', name: 'Discussion', position: 9, defaultTopicType: null },
    ];
    repository.manager.transaction.mockImplementation(async (work) => work({
      query: async () => [], getRepository: () => repository,
    }));
  });
  it('appends new sections and preserves existing mappings', async () => {
    await expect(service.create({ name: 'End' })).resolves.toMatchObject({ position: 10, defaultTopicType: null });
    expect(await service.findAll()).toHaveLength(3);
  });
  it('rejects stealing a mapping but allows keeping, clearing, and releasing it', async () => {
    await expect(service.update('b', { name: 'Discussion', defaultTopicType: 'person' })).rejects.toThrow(ConflictException);
    await expect(service.update('a', { name: 'People', defaultTopicType: 'person' })).resolves.toMatchObject({ defaultTopicType: 'person' });
    await service.update('a', { name: 'People', defaultTopicType: null });
    await expect(service.update('b', { name: 'Discussion', defaultTopicType: 'person' })).resolves.toMatchObject({ defaultTopicType: 'person' });
  });
  it('normalizes the complete order and rejects stale, duplicate, and unknown membership', async () => {
    await expect(service.reorder(['b', 'a'])).resolves.toMatchObject([{ id: 'b', position: 1 }, { id: 'a', position: 2 }]);
    for (const ids of [['a'], ['a', 'a'], ['a', 'unknown']]) {
      await expect(service.reorder(ids)).rejects.toThrow(ConflictException);
      expect((await service.findAll()).map((row) => row.id)).toEqual(['b', 'a']);
    }
  });
  it('normalizes after deletion and rejects missing sections', async () => {
    await service.remove('a');
    expect(await service.findAll()).toMatchObject([{ id: 'b', position: 1 }]);
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    await expect(service.update('missing', { name: 'Missing' })).rejects.toThrow(NotFoundException);
  });
});
