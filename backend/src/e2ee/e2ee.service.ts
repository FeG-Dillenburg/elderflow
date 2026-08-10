import { ConflictException, ForbiddenException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { User } from '../users/user.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { E2eeAuditEvent } from './e2ee-audit-event.entity';
import { E2eeClientEpoch } from './e2ee-client-epoch.entity';
import { E2eeKeyState } from './e2ee-key-state.entity';
import { E2eeRecoveryCeremony } from './e2ee-recovery-ceremony.entity';
import { ApproveRecoveryDto, RegisterClientEpochDto, StartRecoveryDto } from './dto/e2ee.dto';
import { decodeBase64UrlEnvelope, validateKeyEnvelope } from './envelope-validator';
import { isE2eeKeyOperator } from './e2ee-role-policy';

export const E2EE_CLOCK = Symbol('E2EE_CLOCK');
const RECOVERY_LIFETIME_MS = 30 * 60 * 1000;
const PARTICIPANT_CONFIRMATION_LIFETIME_MS = 30 * 1000;

export interface E2eeClock {
  now(): Date;
}

@Injectable()
export class E2eeService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(E2EE_CLOCK) private readonly clock: E2eeClock,
  ) {}

  async keyState(user: User) {
    this.assertContentUser(user);
    const state = await this.dataSource.getRepository(E2eeKeyState).findOne({ where: { id: 1 } });
    if (!state) throw codedHttpException(HttpStatus.SERVICE_UNAVAILABLE, 'E2EE_NOT_CONFIGURED', 'Protected text is not configured');
    return {
      envelopeFormat: 1,
      cryptoSuite: 1,
      passphraseKdf: {
        version: 1,
        operationsLimit: 3,
        memoryLimit: 67_108_864,
        outputLength: 32,
      },
      organizationId: state.organizationId,
      generation: state.generation,
      orkId: state.orkId,
      ockId: state.ockId,
      ockEpoch: state.ockEpoch,
    };
  }

  async keyWrapper(user: User, kind: 'shared-passphrase-slot' | 'content-key-wrapper'): Promise<Buffer> {
    this.assertContentUser(user);
    const state = await this.requiredKeyState();
    return kind === 'shared-passphrase-slot' ? state.sharedPassphraseSlot : state.contentKeyWrapper;
  }

  async recoveryMetadata(user: User) {
    this.assertKeyOperator(user);
    const state = await this.requiredKeyState();
    return {
      ...(await this.keyState(user)),
    };
  }

  async recoverySlot(user: User): Promise<Buffer> {
    this.assertKeyOperator(user);
    return (await this.requiredKeyState()).recoverySlot;
  }

  async recoveryCeremony(user: User, id: string) {
    this.assertKeyOperator(user);
    const ceremony = await this.dataSource.getRepository(E2eeRecoveryCeremony).findOne({ where: { id } });
    if (!ceremony) throw codedHttpException(HttpStatus.NOT_FOUND, 'E2EE_CEREMONY_NOT_FOUND', 'Key ceremony was not found');
    this.assertCeremonyActive(ceremony);
    return {
      id: ceremony.id,
      state: ceremony.state,
      expectedGeneration: ceremony.expectedGeneration,
      candidateFingerprint: ceremony.candidateFingerprint.toString('base64url'),
      expiresAt: ceremony.expiresAt.toISOString(),
    };
  }

  async recoveryCandidate(user: User, id: string): Promise<Buffer> {
    this.assertKeyOperator(user);
    const ceremony = await this.dataSource.getRepository(E2eeRecoveryCeremony).findOne({ where: { id } });
    if (!ceremony) throw codedHttpException(HttpStatus.NOT_FOUND, 'E2EE_CEREMONY_NOT_FOUND', 'Key ceremony was not found');
    this.assertCeremonyActive(ceremony);
    return ceremony.candidateSharedPassphraseSlot;
  }

  async registerClientEpoch(user: User, input: RegisterClientEpochDto): Promise<{ registered: true }> {
    this.assertContentUser(user);
    const state = await this.requiredKeyState();
    const epoch = this.dataSource.getRepository(E2eeClientEpoch).create({
      id: input.id,
      organizationId: state.organizationId,
      userId: user.id,
      noncePrefix: this.decodeExact(input.noncePrefix, 16, 'E2EE_CLIENT_EPOCH_INVALID'),
      signingPublicKey: this.decodeExact(input.signingPublicKey, 32, 'E2EE_CLIENT_EPOCH_INVALID'),
      revokedAt: null,
    });
    try {
      await this.dataSource.getRepository(E2eeClientEpoch).save(epoch);
    } catch {
      throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CLIENT_EPOCH_CONFLICT', 'Client epoch is already registered');
    }
    return { registered: true };
  }

  async revokeClientEpoch(user: User, epochId: string): Promise<void> {
    this.assertContentUser(user);
    await this.dataSource.getRepository(E2eeClientEpoch).update(
      { id: epochId, userId: user.id, revokedAt: IsNull() },
      { revokedAt: this.clock.now() },
    );
  }

  async startRecovery(user: User, sessionId: string, input: StartRecoveryDto) {
    this.assertKeyOperator(user);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('elderflow-e2ee-recovery'))");
      const active = await manager.findOne(E2eeRecoveryCeremony, {
        where: { state: In(['pending_second_operator', 'ready_to_activate']) },
      });
      const now = this.clock.now();
      if (active && active.expiresAt > now) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_CONCURRENT', 'Another key ceremony is active');
      }
      if (active) {
        active.state = 'aborted';
        await manager.save(E2eeRecoveryCeremony, active);
      }
      const state = await manager.findOne(E2eeKeyState, { where: { id: 1 }, lock: { mode: 'pessimistic_read' } });
      if (!state || state.generation !== input.expectedGeneration) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_KEY_STATE_STALE', 'Key state has changed');
      }
      const candidateFingerprint = this.decodeExact(input.candidateFingerprint, 32, 'E2EE_CANDIDATE_INVALID');
      const candidateSharedPassphraseSlot = this.decodeKeyEnvelope(input.candidateSharedPassphraseSlot, state);
      const computedFingerprint = createHash('sha256').update(candidateSharedPassphraseSlot).digest();
      if (!timingSafeEqual(candidateFingerprint, computedFingerprint)) {
        throw codedHttpException(HttpStatus.BAD_REQUEST, 'E2EE_CANDIDATE_INVALID', 'Candidate fingerprint does not match');
      }
      const ceremony = manager.create(E2eeRecoveryCeremony, {
        initiatorId: user.id,
        initiatorSessionVersion: user.sessionVersion,
        initiatorSessionId: sessionId,
        approverId: null,
        approverSessionVersion: null,
        approverSessionId: null,
        initiatorConfirmedAt: now,
        approverConfirmedAt: null,
        state: 'pending_second_operator',
        expectedGeneration: state.generation,
        candidateFingerprint,
        candidateSharedPassphraseSlot,
        expiresAt: new Date(now.getTime() + RECOVERY_LIFETIME_MS),
        activatedGeneration: null,
      });
      const saved = await manager.save(E2eeRecoveryCeremony, ceremony);
      return { id: saved.id, state: saved.state, expiresAt: saved.expiresAt.toISOString() };
    });
  }

  async approveRecovery(user: User, sessionId: string, id: string, input: ApproveRecoveryDto) {
    this.assertKeyOperator(user);
    return this.dataSource.transaction(async (manager) => {
      const ceremony = await this.lockCeremony(manager, id);
      this.assertCeremonyActive(ceremony);
      if (ceremony.state !== 'pending_second_operator') {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_STATE_INVALID', 'Ceremony is not awaiting approval');
      }
      if (ceremony.initiatorId === user.id) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_DISTINCT_OPERATOR_REQUIRED', 'A distinct Key operator is required');
      }
      await this.assertRecordedOperatorsEligible(manager, ceremony, false);
      const fingerprint = this.decodeExact(input.candidateFingerprint, 32, 'E2EE_CANDIDATE_INVALID');
      if (!timingSafeEqual(ceremony.candidateFingerprint, fingerprint)) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CANDIDATE_MISMATCH', 'Candidate key states do not match');
      }
      ceremony.approverId = user.id;
      ceremony.approverSessionVersion = user.sessionVersion;
      ceremony.approverSessionId = sessionId;
      ceremony.approverConfirmedAt = this.clock.now();
      ceremony.state = 'ready_to_activate';
      await manager.save(E2eeRecoveryCeremony, ceremony);
      return { id: ceremony.id, state: ceremony.state, expiresAt: ceremony.expiresAt.toISOString() };
    });
  }

  async activateRecovery(user: User, sessionId: string, id: string): Promise<{ activated: true; generation: number }> {
    this.assertKeyOperator(user);
    return this.dataSource.transaction(async (manager) => {
      const ceremony = await this.lockCeremony(manager, id);
      if (ceremony.state === 'activated' && ceremony.activatedGeneration) {
        if (!this.isBoundParticipant(ceremony, user.id, sessionId)) throw new ForbiddenException();
        return { activated: true, generation: ceremony.activatedGeneration };
      }
      this.assertCeremonyActive(ceremony);
      if (ceremony.state !== 'ready_to_activate' || !ceremony.approverId) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_STATE_INVALID', 'Ceremony is not ready to activate');
      }
      if (!this.isBoundParticipant(ceremony, user.id, sessionId)) {
        throw new ForbiddenException('Only a participating Key operator can activate this ceremony');
      }
      await this.assertRecordedOperatorsEligible(manager, ceremony, true);
      const confirmationCutoff = this.clock.now().getTime() - PARTICIPANT_CONFIRMATION_LIFETIME_MS;
      if (!ceremony.initiatorConfirmedAt || !ceremony.approverConfirmedAt
        || ceremony.initiatorConfirmedAt.getTime() < confirmationCutoff
        || ceremony.approverConfirmedAt.getTime() < confirmationCutoff) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          'E2EE_CEREMONY_PARTICIPANT_CONFIRMATION_REQUIRED',
          'Both participating sessions must be present to activate the ceremony',
        );
      }
      const state = await manager.findOne(E2eeKeyState, { where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
      if (!state || state.generation !== ceremony.expectedGeneration) {
        throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_COMPARE_AND_SWAP_LOST', 'Key state has changed');
      }
      state.sharedPassphraseSlot = ceremony.candidateSharedPassphraseSlot;
      state.generation += 1;
      await manager.save(E2eeKeyState, state);
      const now = this.clock.now();
      await manager.query('UPDATE "users" SET "session_version" = "session_version" + 1');
      await manager.query('UPDATE "e2ee_client_epochs" SET "revoked_at" = $1 WHERE "revoked_at" IS NULL', [now]);
      ceremony.state = 'activated';
      ceremony.activatedGeneration = state.generation;
      await manager.save(E2eeRecoveryCeremony, ceremony);
      await manager.save(E2eeAuditEvent, manager.create(E2eeAuditEvent, {
        eventType: 'recovery_activated',
        actorIds: [ceremony.initiatorId, ceremony.approverId],
        keyGeneration: state.generation,
        outcome: 'success',
      }));
      return { activated: true, generation: state.generation };
    });
  }

  async abortRecovery(user: User, sessionId: string, id: string): Promise<void> {
    this.assertKeyOperator(user);
    await this.dataSource.transaction(async (manager) => {
      const ceremony = await this.lockCeremony(manager, id);
      if (ceremony.state === 'activated' || ceremony.state === 'aborted') return;
      if (!this.isBoundParticipant(ceremony, user.id, sessionId)) {
        throw new ForbiddenException('Only a participating Key operator can abort this ceremony');
      }
      ceremony.state = 'aborted';
      await manager.save(E2eeRecoveryCeremony, ceremony);
    });
  }

  async confirmRecoveryPresence(user: User, sessionId: string, id: string): Promise<{ confirmed: true }> {
    this.assertKeyOperator(user);
    return this.dataSource.transaction(async (manager) => {
      const ceremony = await this.lockCeremony(manager, id);
      this.assertCeremonyActive(ceremony);
      if (ceremony.state === 'pending_second_operator') {
        if (ceremony.initiatorId !== user.id || ceremony.initiatorSessionId !== sessionId) {
          throw new ForbiddenException('Only the initiating application session can confirm presence');
        }
        ceremony.initiatorConfirmedAt = this.clock.now();
        await manager.save(E2eeRecoveryCeremony, ceremony);
      } else if (ceremony.state === 'ready_to_activate') {
        if (ceremony.initiatorId === user.id && ceremony.initiatorSessionId === sessionId) {
          ceremony.initiatorConfirmedAt = this.clock.now();
        } else if (ceremony.approverId === user.id && ceremony.approverSessionId === sessionId) {
          ceremony.approverConfirmedAt = this.clock.now();
        } else {
          throw new ForbiddenException('Only a participating application session can confirm presence');
        }
        await manager.save(E2eeRecoveryCeremony, ceremony);
      }
      return { confirmed: true };
    });
  }

  private assertContentUser(user: User): void {
    if (!isE2eeKeyOperator(user.role)) {
      throw new ForbiddenException('Your role cannot access Protected-text keys');
    }
  }

  private assertKeyOperator(user: User): void {
    this.assertContentUser(user);
  }

  private requiredKeyState(): Promise<E2eeKeyState> {
    return this.dataSource.getRepository(E2eeKeyState).findOneOrFail({ where: { id: 1 } });
  }

  private async lockCeremony(manager: EntityManager, id: string): Promise<E2eeRecoveryCeremony> {
    const ceremony = await manager.findOne(E2eeRecoveryCeremony, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!ceremony) throw codedHttpException(HttpStatus.NOT_FOUND, 'E2EE_CEREMONY_NOT_FOUND', 'Key ceremony was not found');
    return ceremony;
  }

  private assertCeremonyActive(ceremony: E2eeRecoveryCeremony): void {
    if (ceremony.expiresAt <= this.clock.now()) {
      throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_EXPIRED', 'Key ceremony has expired');
    }
  }

  private decodeExact(value: string, length: number, code: string): Buffer {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length !== length || decoded.toString('base64url') !== value) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, code, 'Invalid E2EE binary value');
    }
    return decoded;
  }

  private async assertRecordedOperatorsEligible(
    manager: EntityManager,
    ceremony: E2eeRecoveryCeremony,
    requireApprover: boolean,
  ): Promise<void> {
    const operatorIds = [ceremony.initiatorId, ...(ceremony.approverId ? [ceremony.approverId] : [])];
    if (requireApprover && operatorIds.length !== 2) {
      throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_OPERATOR_INELIGIBLE', 'A ceremony operator is no longer eligible');
    }
    const operators = await manager.find(User, { where: { id: In(operatorIds), archivedAt: IsNull() } });
    const expectedVersions = new Map([
      [ceremony.initiatorId, ceremony.initiatorSessionVersion],
      ...(ceremony.approverId ? [[ceremony.approverId, ceremony.approverSessionVersion] as [string, number | null]] : []),
    ]);
    if (operators.length !== operatorIds.length || operators.some((operator) => (
      !isE2eeKeyOperator(operator.role) || operator.sessionVersion !== expectedVersions.get(operator.id)
    ))) {
      ceremony.state = 'aborted';
      await manager.save(E2eeRecoveryCeremony, ceremony);
      throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_OPERATOR_INELIGIBLE', 'A ceremony operator is no longer eligible');
    }
  }

  private isBoundParticipant(ceremony: E2eeRecoveryCeremony, userId: string, sessionId: string): boolean {
    return (ceremony.initiatorId === userId && ceremony.initiatorSessionId === sessionId)
      || (ceremony.approverId === userId && ceremony.approverSessionId === sessionId);
  }

  private decodeKeyEnvelope(value: string, state: E2eeKeyState): Buffer {
    const decoded = decodeBase64UrlEnvelope(value);
    const metadata = validateKeyEnvelope(decoded, 1);
    if (metadata.organizationId !== state.organizationId || metadata.wrappedKeyId !== state.orkId) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'E2EE_ENVELOPE_CONTEXT_INVALID', 'E2EE envelope context does not match');
    }
    return decoded;
  }
}
