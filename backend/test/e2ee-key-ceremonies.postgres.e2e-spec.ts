import 'dotenv/config';
import { DataSource } from 'typeorm';
import { E2eeAuditEvent } from '../src/e2ee/e2ee-audit-event.entity';
import { E2eeClientEpoch } from '../src/e2ee/e2ee-client-epoch.entity';
import { E2eeKeyState } from '../src/e2ee/e2ee-key-state.entity';
import { E2eeRecoveryCeremony } from '../src/e2ee/e2ee-recovery-ceremony.entity';
import { E2eeService } from '../src/e2ee/e2ee.service';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `key_ceremony_${process.pid}_${Date.now()}`;
const now = new Date('2026-08-22T11:41:43.000Z');

describeWithPostgres('E2EE key ceremonies with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: E2eeService;
  let initiator: User;
  let approver: User;

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [User, E2eeKeyState, E2eeClientEpoch, E2eeRecoveryCeremony, E2eeAuditEvent],
      synchronize: true,
    });
    await database.initialize();
    service = new E2eeService(database, { now: () => now });

    [initiator, approver] = await database.getRepository(User).save([
      {
        email: 'key-initiator@example.com',
        firstName: 'Key',
        lastName: 'Initiator',
        role: 'user',
        language: 'en',
        passwordHash: null,
        sessionVersion: 1,
        archivedAt: null,
      },
      {
        email: 'key-approver@example.com',
        firstName: 'Key',
        lastName: 'Approver',
        role: 'admin',
        language: 'en',
        passwordHash: null,
        sessionVersion: 1,
        archivedAt: null,
      },
    ]);
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('activates a lost-passphrase ceremony while clearing write grace with a typed null', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const orkId = '00000000-0000-4000-8000-000000000002';
    const ockId = '00000000-0000-4000-8000-000000000003';
    await database.getRepository(E2eeKeyState).save({
      id: 1,
      organizationId,
      generation: 1,
      orkId,
      ockId,
      ockEpoch: 1,
      sharedPassphraseSlot: Buffer.from('old-shared'),
      recoverySlot: Buffer.from('recovery'),
      contentKeyWrapper: Buffer.from('content'),
      custodyAcknowledgedBy: initiator.id,
      custodyAcknowledgedAt: now,
    });
    await database.getRepository(E2eeClientEpoch).save({
      id: '00000000-0000-4000-8000-000000000004',
      organizationId,
      userId: initiator.id,
      noncePrefix: Buffer.alloc(16),
      signingPublicKey: Buffer.alloc(32),
      revokedAt: null,
      writeGraceUntil: null,
    });
    const ceremony = await database.getRepository(E2eeRecoveryCeremony).save({
      operation: 'lost_passphrase',
      reasonCode: 'passphrase_lost',
      initiatorId: initiator.id,
      initiatorSessionVersion: 1,
      initiatorSessionId: 'initiator-session',
      approverId: approver.id,
      approverSessionVersion: 1,
      approverSessionId: 'approver-session',
      initiatorConfirmedAt: new Date(now.getTime() - 10_000),
      approverConfirmedAt: new Date(now.getTime() - 5_000),
      state: 'ready_to_activate',
      expectedGeneration: 1,
      candidateFingerprint: Buffer.alloc(32, 7),
      candidateSharedPassphraseSlot: Buffer.from('new-shared'),
      candidateOrkId: orkId,
      candidateOckId: ockId,
      candidateOckEpoch: 1,
      candidateRecoverySlot: Buffer.from('recovery'),
      candidateContentKeyWrapper: Buffer.from('content'),
      candidateHistoricalOckIds: [],
      candidateHistoricalOckEpochs: [],
      candidateHistoricalContentKeyWrappers: [],
      custodyCopiesAcknowledged: 0,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      activatedGeneration: null,
    });

    await expect(service.activateRecovery(
      approver,
      'approver-session',
      ceremony.id,
    )).resolves.toEqual({ activated: true, generation: 2 });

    await expect(database.getRepository(E2eeClientEpoch).findOneByOrFail({
      id: '00000000-0000-4000-8000-000000000004',
    })).resolves.toMatchObject({
      revokedAt: now,
      writeGraceUntil: null,
    });
  });
});
