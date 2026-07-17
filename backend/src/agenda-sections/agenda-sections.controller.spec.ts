import { PERMISSION_CATEGORY_KEY } from '../auth/permissions';
import { AgendaSectionsController } from './agenda-sections.controller';

describe('AgendaSectionsController', () => {
  it('allows agenda sections to be read as content references while keeping writes protected', async () => {
    const sections = [{ id: 'section-id', name: 'Updates' }];
    const service = { findAll: jest.fn().mockResolvedValue(sections) };
    const controller = new AgendaSectionsController(service as any);

    await expect(controller.findAll()).resolves.toBe(sections);
    expect(Reflect.getMetadata(PERMISSION_CATEGORY_KEY, controller.findAll)).toBe('references');
    expect(Reflect.getMetadata(PERMISSION_CATEGORY_KEY, AgendaSectionsController)).toBe('contentSettings');
  });
});
