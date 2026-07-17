import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { permissionsByRole } from './permissions';

describe('AuthService', () => {
  const queryBuilder = {
    addSelect: jest.fn(), where: jest.fn(), andWhere: jest.fn(), getOne: jest.fn(),
  };
  queryBuilder.addSelect.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);
  queryBuilder.andWhere.mockReturnValue(queryBuilder);
  const users = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder), save: jest.fn(), findOne: jest.fn() };
  const sessions = { create: jest.fn().mockReturnValue('signed-token') };
  const service = new AuthService(users as any, sessions as any);

  beforeEach(() => jest.clearAllMocks());

  it('logs in an active user and returns frontend permissions without its password hash', async () => {
    const user = {
      id: 'user-id', email: 'user@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'admin',
      language: null,
      passwordHash: await hash('password123!', 4),
    } as any;
    queryBuilder.getOne.mockResolvedValue(user);
    await expect(service.login({ email: user.email, password: 'password123!' })).resolves.toEqual({
      token: 'signed-token',
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: 'admin', language: null, permissions: permissionsByRole.admin,
      },
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.archived_at IS NULL');
  });

  it('uses one generic failure for unknown users and invalid passwords', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    await expect(service.login({ email: 'missing@example.com', password: 'password123!' })).rejects.toThrow(UnauthorizedException);
    queryBuilder.getOne.mockResolvedValue({ passwordHash: await hash('different-password', 4) });
    await expect(service.login({ email: 'user@example.com', password: 'password123!' })).rejects.toThrow('Invalid email or password');
  });

  it('updates personal fields without permitting a role change', async () => {
    const user = { id: 'user-id', email: 'old@example.com', firstName: 'Old', lastName: 'Name', role: 'guest' } as any;
    users.save.mockImplementation(async (value) => value);
    const result = await service.updateProfile(user, { email: 'new@example.com', firstName: 'New', lastName: 'Name', language: 'de' });
    expect(result).toEqual(expect.objectContaining({ email: 'new@example.com', firstName: 'New', role: 'guest', language: 'de' }));
    expect(user.role).toBe('guest');
  });
});
