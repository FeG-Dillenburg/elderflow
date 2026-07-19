import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DevelopmentIdentityGuard } from './development-identity.guard';

describe('DevelopmentIdentityGuard', () => {
  const config = { get: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const users = { findOne: jest.fn() };
  const sessions = { verify: jest.fn() };
  const guard = new DevelopmentIdentityGuard(config as any, reflector as any, users as any, sessions as any);
  const context = (method = 'GET', authorization?: string) => {
    const request: any = { method, headers: { authorization } };
    return {
      request,
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  };

  beforeEach(() => jest.clearAllMocks());

  it('bypasses public handlers', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('authenticates a bearer session and attaches its active user', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce('topics');
    sessions.verify.mockReturnValue({ sub: 'user-id' });
    const user = { id: 'user-id', role: 'user' };
    users.findOne.mockResolvedValue(user);
    const requestContext = context('POST', 'Bearer signed-token');
    await expect(guard.canActivate(requestContext)).resolves.toBe(true);
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 'user-id', archivedAt: IsNull() } });
    expect(requestContext.request.user).toBe(user);
  });

  it('rejects missing authentication in production and unknown session users', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    config.get.mockReturnValue('production');
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);

    sessions.verify.mockReturnValue({ sub: 'missing' });
    users.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(context('GET', 'Bearer token'))).rejects.toThrow('Session user does not exist');
  });

  it('retains development-only identity fallback', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);
    config.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEV_AUTH_BYPASS') return true;
      return 'ADMIN@EXAMPLE.COM';
    });
    users.findOne.mockResolvedValue({ id: 'user-id', role: 'admin' });
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(users.findOne).toHaveBeenCalledWith({ where: { email: 'admin@example.com', archivedAt: IsNull() } });
  });

  it.each([
    ['it-admin', 'meetings', 'GET'],
    ['it-admin', 'users', 'PATCH'],
    ['guest', 'users', 'GET'],
    ['guest', 'topics', 'POST'],
    ['guest', 'meetings', 'PUT'],
    ['user', 'authSettings', 'GET'],
  ])('rejects %s access to %s %s', async (role, category, method) => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(category);
    sessions.verify.mockReturnValue({ sub: 'user-id' });
    users.findOne.mockResolvedValue({ id: 'user-id', role });
    await expect(guard.canActivate(context(method, 'Bearer token'))).rejects.toThrow(ForbiddenException);
  });

  it('allows guest reads and admin writes in permitted domains', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce('meetings');
    sessions.verify.mockReturnValue({ sub: 'guest' });
    users.findOne.mockResolvedValue({ id: 'guest', role: 'guest' });
    await expect(guard.canActivate(context('GET', 'Bearer token'))).resolves.toBe(true);

    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce('users');
    sessions.verify.mockReturnValue({ sub: 'admin' });
    users.findOne.mockResolvedValue({ id: 'admin', role: 'admin' });
    await expect(guard.canActivate(context('PATCH', 'Bearer token'))).resolves.toBe(true);
  });

  it('allows guests to load shared content references', async () => {
    sessions.verify.mockReturnValue({ sub: 'guest' });
    users.findOne.mockResolvedValue({ id: 'guest', role: 'guest' });

    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce('references');
    await expect(guard.canActivate(context('GET', 'Bearer token'))).resolves.toBe(true);
  });

  it('allows IT admins to view users without granting user-management access', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce('users');
    sessions.verify.mockReturnValue({ sub: 'it-admin' });
    users.findOne.mockResolvedValue({ id: 'it-admin', role: 'it-admin' });
    await expect(guard.canActivate(context('GET', 'Bearer token'))).resolves.toBe(true);
  });
});
