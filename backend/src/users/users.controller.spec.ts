import { PERMISSION_CATEGORY_KEY } from '../auth/permissions';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('exposes active users for content references without granting directory access', async () => {
    const users = [{ id: 'user-id', firstName: 'Ada', lastName: 'Lovelace' }];
    const service = { findAll: jest.fn().mockResolvedValue(users) };
    const controller = new UsersController(service as any);

    await expect(controller.findDirectory()).resolves.toBe(users);
    expect(service.findAll).toHaveBeenCalledWith();
    expect(Reflect.getMetadata(PERMISSION_CATEGORY_KEY, controller.findDirectory)).toBe('references');
    expect(Reflect.getMetadata(PERMISSION_CATEGORY_KEY, UsersController)).toBe('users');
  });
});
