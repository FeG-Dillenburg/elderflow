import { ConflictException, ForbiddenException } from '@nestjs/common';
import { E2eeService } from './e2ee.service';

describe('E2eeService', () => {
  const candidateFingerprint = Buffer.alloc(32, 7);
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_: unknown, value: unknown) => value),
    save: jest.fn(async (_: unknown, value: unknown) => value),
    update: jest.fn(),
  };
  const dataSource = {
    getRepository: jest.fn(),
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) => callback(manager)),
  };
  const clock = { now: jest.fn(() => new Date('2026-08-09T10:00:00.000Z')) };
  const service = new E2eeService(dataSource as any, clock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only versioned wrappers and content-free metadata to an eligible Content user', async () => {
    dataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        organizationId: '00000000-0000-4000-8000-000000000001',
        generation: 1,
        orkId: '00000000-0000-4000-8000-000000000003',
        ockId: '00000000-0000-4000-8000-000000000004',
        ockEpoch: 1,
        sharedPassphraseSlot: Buffer.from('shared-wrapper'),
        recoverySlot: Buffer.from('recovery-wrapper'),
        contentKeyWrapper: Buffer.from('content-wrapper'),
      }),
    });

    await expect(service.keyState({ id: 'user-1', role: 'user' } as any)).resolves.toEqual({
      envelopeFormat: 1,
      cryptoSuite: 1,
      passphraseKdf: { version: 1, operationsLimit: 3, memoryLimit: 67_108_864, outputLength: 32 },
      organizationId: '00000000-0000-4000-8000-000000000001',
      generation: 1,
      orkId: '00000000-0000-4000-8000-000000000003',
      ockId: '00000000-0000-4000-8000-000000000004',
      ockEpoch: 1,
      sharedPassphraseSlot: Buffer.from('shared-wrapper').toString('base64url'),
      contentKeyWrapper: Buffer.from('content-wrapper').toString('base64url'),
    });
  });

  it.each(['it-admin', 'guest'])('denies key state and recovery to the %s role', async (role) => {
    const user = { id: `${role}-id`, role } as any;

    await expect(service.keyState(user)).rejects.toThrow(ForbiddenException);
    await expect(service.startRecovery(user, {} as any)).rejects.toThrow(ForbiddenException);
  });

  it('requires a second distinct Key operator with the same verified candidate before activation', async () => {
    manager.findOne.mockResolvedValueOnce({
      id: 'ceremony-1',
      state: 'pending_second_operator',
      initiatorId: 'operator-1',
      approverId: null,
      candidateFingerprint,
      expectedGeneration: 1,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
    });

    await expect(service.approveRecovery(
      { id: 'operator-2', role: 'admin' } as any,
      'ceremony-1',
      { candidateFingerprint: candidateFingerprint.toString('base64url') },
    )).resolves.toEqual({ id: 'ceremony-1', state: 'ready_to_activate', expiresAt: '2026-08-09T10:30:00.000Z' });

    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      approverId: 'operator-2',
      state: 'ready_to_activate',
    }));
  });

  it('fails closed when the same operator approves or candidate states differ', async () => {
    manager.findOne.mockResolvedValue({
      id: 'ceremony-1',
      state: 'pending_second_operator',
      initiatorId: 'operator-1',
      approverId: null,
      candidateFingerprint,
      expectedGeneration: 1,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
    });

    await expect(service.approveRecovery(
      { id: 'operator-1', role: 'user' } as any,
      'ceremony-1',
      { candidateFingerprint: candidateFingerprint.toString('base64url') },
    )).rejects.toThrow(ConflictException);
    await expect(service.approveRecovery(
      { id: 'operator-2', role: 'user' } as any,
      'ceremony-1',
      { candidateFingerprint: Buffer.alloc(32, 8).toString('base64url') },
    )).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('atomically activates an approved candidate and revokes sessions and client epochs', async () => {
    manager.findOne
      .mockResolvedValueOnce({
        id: 'ceremony-1',
        state: 'ready_to_activate',
        initiatorId: 'operator-1',
        approverId: 'operator-2',
        expectedGeneration: 3,
        expiresAt: new Date('2026-08-09T10:30:00.000Z'),
        candidateSharedPassphraseSlot: Buffer.from('new-shared'),
      })
      .mockResolvedValueOnce({ id: 1, generation: 3 });

    await expect(service.activateRecovery(
      { id: 'operator-2', role: 'admin' } as any,
      'ceremony-1',
    )).resolves.toEqual({ activated: true, generation: 4 });

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "users" SET "session_version"'));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "e2ee_client_epochs"'), [clock.now()]);
    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      generation: 4,
      sharedPassphraseSlot: Buffer.from('new-shared'),
    }));
  });
});
