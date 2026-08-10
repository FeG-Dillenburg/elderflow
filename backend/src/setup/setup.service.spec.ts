import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { hashSync } from 'bcryptjs';
import { SetupService } from './setup.service';
import { Encoder } from 'cbor-x';

const encoder = new Encoder({ mapsAsObjects: false, structuredClone: false, tagUint8Array: false, useRecords: false });
const uuid = (lastByte: number) => Buffer.from(`000000000000400080000000000000${lastByte.toString(16).padStart(2, '0')}`, 'hex');
const envelope = (kind: 1 | 2 | 3): Buffer => {
  const nonce = Buffer.alloc(24, kind);
  const header = kind === 1
    ? [uuid(1), uuid(2), uuid(3), 1, 3, 67_108_864, Buffer.alloc(16, 1), nonce]
    : kind === 2
      ? [uuid(1), uuid(5), uuid(3), 1, nonce]
      : [uuid(1), uuid(3), uuid(4), 1, nonce];
  return Buffer.from(encoder.encode([1, kind, 1, header, Buffer.alloc(48, kind), null]));
};

describe('SetupService', () => {
  const e2ee = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    orkId: '00000000-0000-4000-8000-000000000003',
    ockId: '00000000-0000-4000-8000-000000000004',
    sharedPassphraseSlot: envelope(1).toString('base64url'),
    recoverySlot: envelope(2).toString('base64url'),
    contentKeyWrapper: envelope(3).toString('base64url'),
    custodyCopiesAcknowledged: 2,
  };
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
      e2ee,
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
      e2ee,
    });

    expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
    expect(manager.count).toHaveBeenCalled();
    expect(manager.create.mock.calls[1][1]).toEqual(expect.objectContaining({
      email: 'ada@example.com', role: 'superadmin', passwordHash: expect.any(String),
    }));
    expect(manager.create).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      id: 1, defaultLanguage: 'de',
    }));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "agenda_sections"'));
    expect(result).toEqual(expect.objectContaining({ id: 'user-id', role: 'superadmin' }));
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('atomically stores only browser-created key wrappers and two-copy custody acknowledgements', async () => {
    await service.createInitialUser({
      setupPassword: 'startup-setup-password',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      password: 'password123!',
      defaultLanguage: 'en',
      e2ee,
    } as any);

    const stored = manager.create.mock.calls[2][1] as any;
    expect(stored).toEqual(expect.objectContaining({
      id: 1,
      generation: 1,
      ockEpoch: 1,
      custodyAcknowledgedBy: 'user-id',
      custodyAcknowledgedAt: expect.any(Date),
    }));
    expect(stored.sharedPassphraseSlot.toString('base64url')).toBe(e2ee.sharedPassphraseSlot);
    expect(stored.recoverySlot.toString('base64url')).toBe(e2ee.recoverySlot);
    expect(stored.contentKeyWrapper.toString('base64url')).toBe(e2ee.contentKeyWrapper);
    const savedValues = manager.save.mock.calls.map(([, value]) => value);
    expect(JSON.stringify(savedValues)).not.toContain('Recovery Secret');
  });

  it('rejects creation when another request has already completed setup', async () => {
    manager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await expect(service.createInitialUser({
      setupPassword: 'startup-setup-password', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
      defaultLanguage: 'en',
      e2ee,
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
      e2ee,
    })).rejects.toThrow('translation update failed');
  });
});
