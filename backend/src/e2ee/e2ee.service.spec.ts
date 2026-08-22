import { ConflictException, ForbiddenException } from '@nestjs/common';
import { E2eeService } from './e2ee.service';
import * as envelopeValidator from './envelope-validator';

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

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('returns the active ceremony and the current session participant role', async () => {
    dataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        id: 'ceremony-1',
        operation: 'change_passphrase',
        reasonCode: 'team_member_left',
        state: 'pending_second_operator',
        initiatorId: 'operator-1',
        initiatorSessionId: 'initiator-session',
        approverId: null,
        approverSessionId: null,
        expiresAt: new Date('2026-08-09T10:30:00.000Z'),
      }),
    });

    await expect(service.activeCeremony(
      { id: 'operator-2', role: 'admin' } as any,
      'second-session',
    )).resolves.toEqual({
      id: 'ceremony-1',
      operation: 'change_passphrase',
      reasonCode: 'team_member_left',
      state: 'pending_second_operator',
      expiresAt: '2026-08-09T10:30:00.000Z',
      participantRole: null,
    });

    await expect(service.activeCeremony(
      { id: 'operator-1', role: 'user' } as any,
      'initiator-session',
    )).resolves.toMatchObject({ participantRole: 'initiator' });
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
        operation: 'change_passphrase',
        reasonCode: 'team_member_left',
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
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "e2ee_client_epochs"'),
      [clock.now(), true, new Date('2026-08-16T10:00:00.000Z')],
    );
    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      generation: 4,
      sharedPassphraseSlot: Buffer.from('new-shared'),
    }));
  });

  it('atomically activates a compromise candidate with new Root and Content Keys', async () => {
    manager.findOne
      .mockResolvedValueOnce({
        id: 'ceremony-rotation',
        operation: 'rotate_root_and_content_key',
        reasonCode: 'encryption_key_disclosed',
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
        candidateOrkId: '00000000-0000-4000-8000-000000000101',
        candidateOckId: '00000000-0000-4000-8000-000000000102',
        candidateOckEpoch: 2,
        candidateSharedPassphraseSlot: Buffer.from('new-shared'),
        candidateRecoverySlot: Buffer.from('new-recovery'),
        candidateContentKeyWrapper: Buffer.from('new-content'),
        custodyCopiesAcknowledged: 2,
      })
      .mockResolvedValueOnce({
        id: 1,
        organizationId: '00000000-0000-4000-8000-000000000001',
        generation: 3,
        orkId: '00000000-0000-4000-8000-000000000003',
        ockId: '00000000-0000-4000-8000-000000000004',
        ockEpoch: 1,
      });
    manager.find.mockResolvedValue([
      { id: 'operator-1', role: 'user', sessionVersion: 2 },
      { id: 'operator-2', role: 'admin', sessionVersion: 4 },
    ]);

    await service.activateRecovery(
      { id: 'operator-2', role: 'admin', sessionVersion: 4 } as any,
      'approver-session',
      'ceremony-rotation',
    );

    expect(manager.save).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      generation: 4,
      orkId: '00000000-0000-4000-8000-000000000101',
      ockId: '00000000-0000-4000-8000-000000000102',
      ockEpoch: 2,
      sharedPassphraseSlot: Buffer.from('new-shared'),
      recoverySlot: Buffer.from('new-recovery'),
      contentKeyWrapper: Buffer.from('new-content'),
    }));
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('e2ee_content_key_wrappers'),
      expect.arrayContaining(['00000000-0000-4000-8000-000000000102']),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "e2ee_client_epochs"'),
      [clock.now(), false, new Date('2026-08-16T10:00:00.000Z')],
    );
  });

  it('rejects a Root rotation that omits an authoritative historical Content Key wrapper', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const oldRootId = '00000000-0000-4000-8000-000000000003';
    const newRootId = '00000000-0000-4000-8000-000000000103';
    const currentContentId = '00000000-0000-4000-8000-000000000004';
    const historicalContentId = '00000000-0000-4000-8000-000000000005';
    jest.spyOn(envelopeValidator, 'validateKeyEnvelope').mockImplementation((_encoded, kind) => ({
      organizationId,
      primaryKeyId: kind === 3 ? newRootId : organizationId,
      wrappedKeyId: kind === 3 ? currentContentId : newRootId,
    }));
    manager.find.mockResolvedValue([
      { ockId: currentContentId, ockEpoch: 2 },
      { ockId: historicalContentId, ockEpoch: 1 },
    ]);
    const state = {
      organizationId,
      orkId: oldRootId,
      ockId: currentContentId,
      ockEpoch: 2,
      sharedPassphraseSlot: Buffer.from('old-shared'),
      recoverySlot: Buffer.from('old-recovery'),
      contentKeyWrapper: Buffer.from('old-content'),
    };
    const candidate = {
      operation: 'rotate_root_key',
      reasonCode: 'planned_root_rotation',
      expectedGeneration: 3,
      orkId: newRootId,
      ockId: currentContentId,
      ockEpoch: 2,
      sharedPassphraseSlot: Buffer.from('new-shared'),
      recoverySlot: Buffer.from('new-recovery'),
      contentKeyWrapper: Buffer.from('new-content'),
      custodyCopiesAcknowledged: 0,
    };

    await expect((service as any).validateCandidateState(manager, candidate, state))
      .rejects.toMatchObject({
        response: expect.objectContaining({ code: 'E2EE_HISTORICAL_WRAPPERS_REQUIRED' }),
      });
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
