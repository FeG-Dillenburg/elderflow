import { ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  const repository = { count: jest.fn() };
  const manager = {
    query: jest.fn(),
    count: jest.fn(),
    create: jest.fn((_: unknown, value: unknown) => value),
    save: jest.fn(async (_: unknown, value: unknown) => ({ id: 'user-id', ...(value as object) })),
  };
  const dataSource = {
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) => callback(manager)),
  };
  const service = new SetupService(dataSource as any, 'startup-setup-password');

  beforeEach(() => {
    jest.clearAllMocks();
    repository.count.mockResolvedValue(0);
    manager.count.mockResolvedValue(0);
  });

  it('reports whether setup is required and rejects verification after setup', async () => {
    await expect(service.status()).resolves.toEqual({ setupRequired: true });
    await expect(service.verifyPassword('startup-setup-password')).resolves.toEqual({ valid: true });

    repository.count.mockResolvedValue(1);
    await expect(service.status()).resolves.toEqual({ setupRequired: false });
    await expect(service.verifyPassword('startup-setup-password')).rejects.toThrow(new ConflictException('System already setup'));
  });

  it('rejects an invalid setup password without opening a transaction', async () => {
    await expect(service.verifyPassword('wrong-password')).rejects.toThrow(UnauthorizedException);
    await expect(service.createInitialUser({
      setupPassword: 'wrong-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
    })).rejects.toThrow('Invalid setup password');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('serializes setup and creates the only initial user as a superadmin', async () => {
    const result = await service.createInitialUser({
      setupPassword: 'startup-setup-password',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'password123!',
    });

    expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
    expect(manager.count).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      email: 'ada@example.com', role: 'superadmin', passwordHash: expect.any(String),
    }));
    expect(result).toEqual(expect.objectContaining({ id: 'user-id', role: 'superadmin' }));
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects creation when another request has already completed setup', async () => {
    manager.count.mockResolvedValue(1);
    await expect(service.createInitialUser({
      setupPassword: 'startup-setup-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
    })).rejects.toThrow('System already setup');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('prints the current startup password to the backend log', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    service.onModuleInit();
    expect(log).toHaveBeenCalledWith('Initial setup password: startup-setup-password');
    log.mockRestore();
  });
});
