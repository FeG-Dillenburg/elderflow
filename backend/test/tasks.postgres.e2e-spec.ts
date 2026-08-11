import 'dotenv/config';
import { Encoder } from 'cbor-x';
import sodium from 'libsodium-wrappers-sumo';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { EncryptedTaskScalars1720000013000 } from '../src/database/migrations/1720000013000-EncryptedTaskScalars';
import { E2eeClientEpoch } from '../src/e2ee/e2ee-client-epoch.entity';
import { E2eeKeyState } from '../src/e2ee/e2ee-key-state.entity';
import { E2eeScalarWrite } from '../src/e2ee/e2ee-scalar-write.entity';
import { E2eeScalarService } from '../src/e2ee/e2ee-scalar.service';
import { SCALAR_AGGREGATES, TASK_SCALAR_FIELDS } from '../src/e2ee/scalar-registry';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { Task } from '../src/tasks/task.entity';
import { TasksService } from '../src/tasks/tasks.service';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `tasks_${process.pid}_${Date.now()}`;
const migrationSchema = `${schema}_migration`;
const organizationId = '00000000-0000-4000-8000-000000000047';
const ockId = '00000000-0000-4000-8000-000000000048';
const clientEpochId = '00000000-0000-4000-8000-000000000049';
const noncePrefix = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});

describeWithPostgres('Tasks with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: TasksService;
  let signingPrivateKey: Uint8Array;
  const viewer = {
    id: '00000000-0000-4000-8000-000000000099',
    role: 'user',
  } as User;

  beforeAll(async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(Buffer.alloc(32, 7), 'uint8array');
    signingPrivateKey = signing.privateKey;
    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [
        User,
        AgendaSection,
        Topic,
        TopicUpdate,
        Meeting,
        MeetingUser,
        MeetingTopic,
        Task,
        SkippedRecurrence,
        E2eeKeyState,
        E2eeClientEpoch,
        E2eeScalarWrite,
      ],
      synchronize: true,
    });
    await database.initialize();
    await database.getRepository(User).save(database.getRepository(User).create({
      ...viewer,
      email: 'task-postgres@example.com',
      firstName: 'Task',
      lastName: 'Tester',
      language: 'en',
      passwordHash: null,
      archivedAt: null,
    }));
    await database.getRepository(E2eeKeyState).save({
      id: 1,
      organizationId,
      generation: 1,
      orkId: '00000000-0000-4000-8000-000000000046',
      ockId,
      ockEpoch: 1,
      sharedPassphraseSlot: Buffer.from([1]),
      recoverySlot: Buffer.from([2]),
      contentKeyWrapper: Buffer.from([3]),
      custodyAcknowledgedBy: viewer.id,
      custodyAcknowledgedAt: new Date(),
    });
    await database.getRepository(E2eeClientEpoch).save({
      id: clientEpochId,
      organizationId,
      userId: viewer.id,
      noncePrefix,
      signingPublicKey: Buffer.from(signing.publicKey),
      revokedAt: null,
    });
    service = new TasksService(database.getRepository(Task), new E2eeScalarService());
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${migrationSchema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('persists, replays, edits, and completes through the shared scalar-write ledger', async () => {
    const id = '00000000-0000-4000-8000-000000000050';
    const titleV1 = signedEnvelope(id, TASK_SCALAR_FIELDS.title.fieldId, 1, 11);
    const descriptionV1 = signedEnvelope(id, TASK_SCALAR_FIELDS.description.fieldId, 1, 12);
    const titleV2 = signedEnvelope(id, TASK_SCALAR_FIELDS.title.fieldId, 2, 13);
    const descriptionV2 = signedEnvelope(id, TASK_SCALAR_FIELDS.description.fieldId, 2, 14);
    await service.create({
      id,
      protected: {
        titleEnvelope: titleV1,
        descriptionEnvelope: descriptionV1,
      },
      topicId: null,
      meetingId: null,
      assignedToId: null,
      dueDate: '2026-08-20',
      status: 'open',
    }, viewer);
    await service.update(id, {
      protected: {
        titleEnvelope: titleV2,
        descriptionEnvelope: descriptionV2,
      },
      status: 'in_progress',
    }, viewer);
    await service.update(id, { protected: { titleEnvelope: titleV2 } }, viewer);
    await service.update(id, { status: 'done' }, viewer);

    const stored = await database.getRepository(Task).findOneByOrFail({ id });
    expect(stored).toMatchObject({
      titleCommitRevision: '2',
      descriptionCommitRevision: '2',
      status: 'done',
      completedAt: expect.any(Date),
    });
    expect(stored.titleEnvelope.toString('base64url')).toBe(titleV2);
    expect(stored.descriptionEnvelope.toString('base64url')).toBe(descriptionV2);

    const ledger = await database.getRepository(E2eeScalarWrite).find({
      where: { recordId: id },
      order: { fieldId: 'ASC', writeCounter: 'ASC' },
    });
    expect(ledger).toHaveLength(4);
    expect(ledger.map(({ aggregateType, fieldId, writeCounter, commitRevision }) => ({
      aggregateType,
      fieldId,
      writeCounter,
      commitRevision,
    }))).toEqual([
      { aggregateType: SCALAR_AGGREGATES.task, fieldId: 1, writeCounter: '1', commitRevision: '1' },
      { aggregateType: SCALAR_AGGREGATES.task, fieldId: 1, writeCounter: '2', commitRevision: '2' },
      { aggregateType: SCALAR_AGGREGATES.task, fieldId: 2, writeCounter: '1', commitRevision: '1' },
      { aggregateType: SCALAR_AGGREGATES.task, fieldId: 2, writeCounter: '2', commitRevision: '2' },
    ]);

    const columns = await database.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'tasks'
      ORDER BY column_name
    `, [schema]);
    const columnNames = (columns as Array<{ column_name: string }>)
      .map(({ column_name }) => column_name);
    expect(columnNames).toEqual(expect.arrayContaining([
      'title_envelope',
      'title_commit_revision',
      'description_envelope',
      'description_commit_revision',
    ]));
    expect(columnNames).not.toEqual(expect.arrayContaining([
      'title',
      'description',
    ]));
  });

  it('runs the Task migration without replacing the scalar-write table introduced by #49', async () => {
    await admin.query(`CREATE SCHEMA "${migrationSchema}"`);
    const migrationDatabase = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema: migrationSchema,
    });
    await migrationDatabase.initialize();
    const runner = migrationDatabase.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${migrationSchema}"`);
      await runner.query(`
        CREATE TABLE "tasks" (
          "id" uuid PRIMARY KEY,
          "title" text NOT NULL,
          "description" text
        )
      `);
      await runner.query(`
        CREATE TABLE "e2ee_scalar_writes" ("sentinel" integer NOT NULL)
      `);
      await runner.query(`INSERT INTO "e2ee_scalar_writes" ("sentinel") VALUES (49)`);

      await new EncryptedTaskScalars1720000013000().up(runner);

      await expect(runner.query(
        `SELECT "sentinel" FROM "e2ee_scalar_writes"`,
      )).resolves.toEqual([{ sentinel: 49 }]);
      const columns = await runner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tasks'
        ORDER BY column_name
      `, [migrationSchema]);
      expect((columns as Array<{ column_name: string }>).map(({ column_name }) => column_name))
        .toEqual([
          'description_commit_revision',
          'description_envelope',
          'id',
          'title_commit_revision',
          'title_envelope',
        ]);
    } finally {
      await runner.release();
      await migrationDatabase.destroy();
    }
  });

  function signedEnvelope(
    recordId: string,
    fieldId: 1 | 2,
    writeCounter: number,
    ciphertextByte: number,
  ): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(writeCounter));
    const nonce = Buffer.concat([noncePrefix, counter]);
    const header = [
      uuidBytes(organizationId),
      SCALAR_AGGREGATES.task,
      uuidBytes(recordId),
      fieldId,
      uuidBytes(ockId),
      uuidBytes(clientEpochId),
      writeCounter,
      nonce,
    ];
    const ciphertext = Buffer.alloc(272, ciphertextByte);
    const signedMessage = Buffer.concat([
      Buffer.from('ElderFlow signed envelope v1\0'),
      Buffer.from(encoder.encode([1, 4, 1, header, ciphertext])),
    ]);
    const signature = sodium.crypto_sign_detached(
      signedMessage,
      signingPrivateKey,
      'uint8array',
    );
    return Buffer.from(encoder.encode([
      1,
      4,
      1,
      header,
      ciphertext,
      signature,
    ])).toString('base64url');
  }
});

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}
