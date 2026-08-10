import { ConflictException, ForbiddenException } from '@nestjs/common';
import { E2eeService } from './e2ee.service';

describe('E2eeService', () => {
  const candidateFingerprint = Buffer.alloc(32, 7);
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
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
    manager.findOne.mockReset();
    manager.find.mockReset();
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
    });
  });

  it.each(['it-admin', 'guest'])('denies key state and recovery to the %s role', async (role) => {
    const user = { id: `${role}-id`, role } as any;

    await expect(service.keyState(user)).rejects.toThrow(ForbiddenException);
    await expect(service.startRecovery(user, 'session-id', {} as any)).rejects.toThrow(ForbiddenException);
  });

  it('requires a second distinct Key operator with the same verified candidate before activation', async () => {
    manager.findOne.mockResolvedValueOnce({
      id: 'ceremony-1',
      state: 'pending_second_operator',
      initiatorId: 'operator-1',
      initiatorSessionVersion: 2,
      approverId: null,
      candidateFingerprint,
      expectedGeneration: 1,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
    });
    manager.find.mockResolvedValue([{ id: 'operator-1', role: 'user', sessionVersion: 2 }]);

    await expect(service.approveRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
      { candidateFingerprint: candidateFingerprint.toString('base64url') },
    )).resolves.toEqual({ id: 'ceremony-1', state: 'ready_to_activate', expiresAt: '2026-08-09T10:30:00.000Z' });

    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      approverId: 'operator-2',
      approverSessionVersion: 4,
      state: 'ready_to_activate',
    }));
  });

  it('fails closed when the same operator approves or candidate states differ', async () => {
    manager.findOne.mockResolvedValue({
      id: 'ceremony-1',
      state: 'pending_second_operator',
      initiatorId: 'operator-1',
      initiatorSessionVersion: 2,
      approverId: null,
      candidateFingerprint,
      expectedGeneration: 1,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
    });
    manager.find.mockResolvedValue([{ id: 'operator-1', role: 'user', sessionVersion: 2 }]);

    await expect(service.approveRecovery(
      { id: 'operator-1', role: 'user' } as any,
      'initiator-session',
      'ceremony-1',
      { candidateFingerprint: candidateFingerprint.toString('base64url') },
    )).rejects.toThrow(ConflictException);
    await expect(service.approveRecovery(
      { id: 'operator-2', role: 'user' } as any,
      'approver-session',
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
        initiatorSessionVersion: 2,
        initiatorSessionId: 'initiator-session',
        approverId: 'operator-2',
        approverSessionVersion: 4,
        approverSessionId: 'approver-session',
        initiatorConfirmedAt: new Date('2026-08-09T09:59:50.000Z'),
        approverConfirmedAt: new Date('2026-08-09T09:59:55.000Z'),
        expectedGeneration: 3,
        expiresAt: new Date('2026-08-09T10:30:00.000Z'),
        candidateSharedPassphraseSlot: Buffer.from('new-shared'),
      })
      .mockResolvedValueOnce({ id: 1, generation: 3 });
    manager.find.mockResolvedValue([
      { id: 'operator-1', role: 'user', sessionVersion: 2 },
      { id: 'operator-2', role: 'admin', sessionVersion: 4 },
    ]);

    await expect(service.activateRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
    )).resolves.toEqual({ activated: true, generation: 4 });

    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "users" SET "session_version"'));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE "e2ee_client_epochs"'), [clock.now()]);
    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      generation: 4,
      sharedPassphraseSlot: Buffer.from('new-shared'),
    }));
  });

  it('allows immediate activation when the initiator was present shortly before approval', async () => {
    const ceremony = {
      id: 'ceremony-1',
      state: 'pending_second_operator',
      initiatorId: 'operator-1',
      initiatorSessionVersion: 2,
      initiatorSessionId: 'initiator-session',
      approverId: null,
      approverSessionVersion: null,
      approverSessionId: null,
      initiatorConfirmedAt: null,
      approverConfirmedAt: null,
      candidateFingerprint,
      expectedGeneration: 3,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
      candidateSharedPassphraseSlot: Buffer.from('new-shared'),
      activatedGeneration: null,
    };
    manager.findOne
      .mockResolvedValueOnce(ceremony)
      .mockResolvedValueOnce(ceremony)
      .mockResolvedValueOnce(ceremony)
      .mockResolvedValueOnce({ id: 1, generation: 3 });
    manager.find
      .mockResolvedValueOnce([
        { id: 'operator-1', role: 'user', sessionVersion: 2 },
      ])
      .mockResolvedValueOnce([
        { id: 'operator-1', role: 'user', sessionVersion: 2 },
        { id: 'operator-2', role: 'admin', sessionVersion: 4 },
      ]);

    await service.confirmRecoveryPresence(
      { id: 'operator-1', role: 'user', sessionVersion: 2 } as any,
      'initiator-session',
      'ceremony-1',
    );
    await service.approveRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
      { candidateFingerprint: candidateFingerprint.toString('base64url') },
    );

    await expect(service.activateRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
    )).resolves.toEqual({ activated: true, generation: 4 });
  });

  it('aborts when either recorded operator lost eligibility or had their sessions revoked', async () => {
    const ceremony = {
      id: 'ceremony-1',
      state: 'ready_to_activate',
      initiatorId: 'operator-1',
      initiatorSessionVersion: 2,
      initiatorSessionId: 'initiator-session',
      approverId: 'operator-2',
      approverSessionVersion: 4,
      approverSessionId: 'approver-session',
      expectedGeneration: 3,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
      candidateSharedPassphraseSlot: Buffer.from('new-shared'),
    };
    manager.findOne.mockResolvedValueOnce(ceremony);
    manager.find.mockResolvedValue([
      { id: 'operator-1', role: 'guest', sessionVersion: 3 },
      { id: 'operator-2', role: 'admin', sessionVersion: 4 },
    ]);

    await expect(service.activateRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
    )).rejects.toThrow('A ceremony operator is no longer eligible');
    expect(ceremony.state).toBe('aborted');
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE "users"'));
  });

  it('refuses activation unless both participating sessions confirmed recent presence', async () => {
    manager.findOne.mockResolvedValueOnce({
      id: 'ceremony-1',
      state: 'ready_to_activate',
      initiatorId: 'operator-1',
      initiatorSessionVersion: 2,
      initiatorSessionId: 'initiator-session',
      approverId: 'operator-2',
      approverSessionVersion: 4,
      approverSessionId: 'approver-session',
      initiatorConfirmedAt: null,
      approverConfirmedAt: new Date('2026-08-09T09:59:55.000Z'),
      expectedGeneration: 3,
      expiresAt: new Date('2026-08-09T10:30:00.000Z'),
    });
    manager.find.mockResolvedValue([
      { id: 'operator-1', role: 'user', sessionVersion: 2 },
      { id: 'operator-2', role: 'admin', sessionVersion: 4 },
    ]);

    await expect(service.activateRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-1',
    )).rejects.toThrow('Both participating sessions must be present');
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE "users"'));
  });
});
