import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { hashSync } from 'bcryptjs';
import { SetupService } from './setup.service';

describe('SetupService', () => {
  const usersRepository = { count: jest.fn() };
  const installationRepository = { count: jest.fn(), findOne: jest.fn() };
  const manager = {
    query: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_: unknown, value: unknown) => value),
    save: jest.fn(async (_: unknown, value: unknown) => ({ id: 'user-id', ...(value as object) })),
  };
  const dataSource = {
    getRepository: jest.fn((entity: { name: string }) => entity.name === 'User' ? usersRepository : installationRepository),
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) => callback(manager)),
  };
  const service = new SetupService(dataSource as any, hashSync('startup-setup-password', 4));

  beforeEach(() => {
    jest.clearAllMocks();
    usersRepository.count.mockResolvedValue(0);
    installationRepository.count.mockResolvedValue(0);
    installationRepository.findOne.mockResolvedValue(null);
    manager.count.mockResolvedValue(0);
    manager.find.mockResolvedValue([
      'Opening / Input',
      'Attendance and next meeting',
      'People in special life circumstances',
      'Urgent topics',
      'Strategic topics',
      'Communication to the church',
      'Dates and appointments',
      'Other topics',
    ].map((name) => ({ name })));
  });

  it('reports installation information and rejects verification after setup', async () => {
    await expect(service.installation()).resolves.toEqual({ setupRequired: true, defaultLanguage: null });
    await expect(service.verifyPassword('startup-setup-password')).resolves.toEqual({ valid: true });

    usersRepository.count.mockResolvedValue(1);
    installationRepository.count.mockResolvedValue(1);
    installationRepository.findOne.mockResolvedValue({ id: 1, defaultLanguage: 'de' });
    await expect(service.installation()).resolves.toEqual({ setupRequired: false, defaultLanguage: 'de' });
    await expect(service.verifyPassword('startup-setup-password')).rejects.toThrow(new ConflictException('System already setup'));
  });

  it('rejects an inconsistent partial installation', async () => {
    usersRepository.count.mockResolvedValue(1);
    await expect(service.installation()).rejects.toThrow('Installation state is inconsistent');
  });

  it('rejects an invalid setup password without opening a transaction', async () => {
    await expect(service.verifyPassword('wrong-password')).rejects.toThrow(UnauthorizedException);
    await expect(service.createInitialUser({
      setupPassword: 'wrong-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
      defaultLanguage: 'en',
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
      defaultLanguage: 'de',
    });

    expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
    expect(manager.count).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      email: 'ada@example.com', role: 'superadmin', passwordHash: expect.any(String),
    }));
    expect(manager.create).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      id: 1, defaultLanguage: 'de',
    }));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "agenda_sections"'));
    expect(result).toEqual(expect.objectContaining({ id: 'user-id', role: 'superadmin' }));
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects creation when another request has already completed setup', async () => {
    manager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await expect(service.createInitialUser({
      setupPassword: 'startup-setup-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
      defaultLanguage: 'en',
    })).rejects.toThrow('System already setup');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rolls back setup when seeded-section localization fails', async () => {
    manager.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('translation update failed'))
      .mockResolvedValueOnce(undefined);
    await expect(service.createInitialUser({
      setupPassword: 'startup-setup-password', defaultLanguage: 'de', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
    })).rejects.toThrow('translation update failed');
  });
});
