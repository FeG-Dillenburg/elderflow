import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { raw } from 'express';
import request from 'supertest';
import { WebSocket } from 'ws';
import { MeetingsController } from '../src/meetings/meetings.controller';
import { MeetingCollaborationRelayService } from '../src/meetings/meeting-collaboration-relay.service';
import { MeetingCollaborationTicketService } from '../src/meetings/meeting-collaboration-ticket.service';
import { MeetingCollaborationTicket } from '../src/meetings/meeting-collaboration-ticket.entity';
import { E2EE_MEDIA_TYPE, isE2eeMediaType } from '../src/e2ee/e2ee-protocol';
import { Encoder } from 'cbor-x';
import sodium from 'libsodium-wrappers-sumo';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { E2eeClientEpoch } from '../src/e2ee/e2ee-client-epoch.entity';
import { E2eeKeyState } from '../src/e2ee/e2ee-key-state.entity';
import { E2eeScalarWrite } from '../src/e2ee/e2ee-scalar-write.entity';
import { E2eeScalarService } from '../src/e2ee/e2ee-scalar.service';
import { MeetingDocumentMutation } from '../src/meetings/meeting-document-mutation.entity';
import { MeetingDocumentSnapshot } from '../src/meetings/meeting-document-snapshot.entity';
import { MeetingDocumentUpdate } from '../src/meetings/meeting-document-update.entity';
import { MeetingDocument } from '../src/meetings/meeting-document.entity';
import { MeetingDocumentService } from '../src/meetings/meeting-document.service';
import { MeetingSnapshotRegistry } from '../src/meetings/meeting-snapshot-contributor';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { MeetingsService } from '../src/meetings/meetings.service';
import { MeetingCompactionCoordinator } from '../src/meetings/meeting-compaction-coordinator';
import { RecurrenceService } from '../src/recurrence/recurrence.service';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { User } from '../src/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `meeting_documents_${process.pid}_${Date.now()}`;
const organizationId = '00000000-0000-4000-8000-000000000151';
const ockId = '00000000-0000-4000-8000-000000000152';
const epochId = '00000000-0000-4000-8000-000000000153';
const secondEpochId = '00000000-0000-4000-8000-000000000167';
const userId = '00000000-0000-4000-8000-000000000154';
const meetingId = '00000000-0000-4000-8000-000000000155';
const documentId = '00000000-0000-4000-8000-000000000156';
const snapshotId = '00000000-0000-4000-8000-000000000157';
const topicId = '00000000-0000-4000-8000-000000000158';
const sectionId = '00000000-0000-4000-8000-000000000159';
const appearanceId = '00000000-0000-4000-8000-000000000160';
const mutationId = '00000000-0000-4000-8000-000000000161';
const targetMeetingId = '00000000-0000-4000-8000-000000000162';
const targetDocumentId = '00000000-0000-4000-8000-000000000163';
const targetSnapshotId = '00000000-0000-4000-8000-000000000164';
const targetAppearanceId = '00000000-0000-4000-8000-000000000165';
const targetMutationId = '00000000-0000-4000-8000-000000000166';
const noncePrefix = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const secondNoncePrefix = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});

describeWithPostgres('Encrypted Meeting workspaces with PostgreSQL', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: MeetingsService;
  const coordinator = new MeetingCompactionCoordinator();
  let signingPrivateKey: Uint8Array;
  let secondSigningPrivateKey: Uint8Array;
  const viewer = { id: userId, role: 'user' } as User;

  beforeAll(async () => {
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(Buffer.alloc(32, 51), 'uint8array');
    const secondSigning = sodium.crypto_sign_seed_keypair(Buffer.alloc(32, 52), 'uint8array');
    signingPrivateKey = signing.privateKey;
    secondSigningPrivateKey = secondSigning.privateKey;
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
        MeetingDocument,
        MeetingDocumentSnapshot,
        MeetingDocumentUpdate,
        MeetingDocumentMutation,
        MeetingCollaborationTicket,
      ],
      synchronize: true,
    });
    await database.initialize();
    await database.getRepository(User).save({
      ...viewer,
      email: 'meeting-workspace@example.com',
      firstName: 'Meeting',
      lastName: 'Writer',
      language: 'en',
      passwordHash: null,
      archivedAt: null,
    });
    await database.getRepository(E2eeKeyState).save({
      id: 1,
      organizationId,
      generation: 1,
      orkId: '00000000-0000-4000-8000-000000000150',
      ockId,
      ockEpoch: 1,
      sharedPassphraseSlot: Buffer.from([1]),
      recoverySlot: Buffer.from([2]),
      contentKeyWrapper: Buffer.from([3]),
      custodyAcknowledgedBy: userId,
      custodyAcknowledgedAt: new Date(),
    });
    await database.getRepository(E2eeClientEpoch).save({
      id: epochId,
      organizationId,
      userId,
      noncePrefix,
      signingPublicKey: Buffer.from(signing.publicKey),
      revokedAt: null,
    });
    await database.getRepository(E2eeClientEpoch).save({
      id: secondEpochId,
      organizationId,
      userId,
      noncePrefix: secondNoncePrefix,
      signingPublicKey: Buffer.from(secondSigning.publicKey),
      revokedAt: null,
    });
    await database.getRepository(AgendaSection).save({ id: sectionId, name: 'Main', position: 1 });
    await database.getRepository(Topic).save({
      id: topicId,
      type: 'generic',
      status: 'open',
      nameEnvelope: Buffer.from([1]),
      nameCommitRevision: '1',
      descriptionEnvelope: Buffer.from([2]),
      descriptionCommitRevision: '1',
      membershipProcessStatusEnvelope: Buffer.from([3]),
      membershipProcessStatusCommitRevision: '1',
      godparentsEnvelope: Buffer.from([4]),
      godparentsCommitRevision: '1',
    });
    await database.getRepository(Meeting).save({
      id: meetingId,
      titleEnvelope: Buffer.from([1]),
      titleCommitRevision: '1',
      date: '2026-08-20',
      beginTime: '19:00',
      status: 'planned',
    });
    await database.getRepository(MeetingDocumentSnapshot).save({
      id: snapshotId,
      documentId,
      parentSnapshotId: null,
      parentEnvelopeHash: Buffer.alloc(32),
      coveredServerSequence: '0',
      coveredAuthorClocks: [],
      ockId,
      meetingCodec: 2,
      clientEpochId: epochId,
      snapshotClock: '1',
      envelope: Buffer.from([1]),
      envelopeFingerprint: Buffer.alloc(32),
    });
    await database.getRepository(MeetingDocument).save({
      id: documentId,
      meetingId,
      envelopeFormat: 1,
      cryptoSuite: 1,
      meetingCodec: 2,
      activeSnapshotId: snapshotId,
      currentServerSequence: '0',
      completedServerSequence: null,
    });
    service = new MeetingsService(
      database,
      database.getRepository(Meeting),
      database.getRepository(MeetingUser),
      database.getRepository(MeetingTopic),
      database.getRepository(Topic),
      database.getRepository(TopicUpdate),
      database.getRepository(Task),
      database.getRepository(AgendaSection),
      new MeetingSnapshotRegistry(),
      new RecurrenceService(),
      new E2eeScalarService(),
      new MeetingDocumentService(),
      coordinator,
    );
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  it('atomically persists an appearance and its initial opaque update with exact-retry idempotency', async () => {
    await expect(service.addTopic(meetingId, {
      id: appearanceId,
      mutationId,
      topicId,
      sectionId,
      initialUpdateEnvelope: 'invalid',
    }, viewer)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_ENVELOPE_INVALID' }),
    });
    await expect(database.getRepository(MeetingTopic).count()).resolves.toBe(0);
    await expect(database.getRepository(MeetingDocumentUpdate).count()).resolves.toBe(0);

    const input = {
      id: appearanceId,
      mutationId,
      topicId,
      sectionId,
      initialUpdateEnvelope: signedUpdate(1),
    };
    await service.addTopic(meetingId, input, viewer);
    await service.addTopic(meetingId, input, viewer);

    await expect(database.getRepository(MeetingTopic).count()).resolves.toBe(1);
    await expect(database.getRepository(MeetingDocumentUpdate).count()).resolves.toBe(1);
    await expect(database.getRepository(MeetingDocumentMutation).count()).resolves.toBe(1);

    await service.appendWorkspaceUpdate(meetingId, signedUpdate(2), viewer);
    await service.appendWorkspaceUpdate(meetingId, signedUpdate(
      1,
      documentId,
      snapshotId,
      secondEpochId,
      secondNoncePrefix,
      secondSigningPrivateKey,
    ), viewer);
    await expect(service.appendWorkspaceUpdate(meetingId, signedUpdate(2), viewer))
      .resolves.toMatchObject({ status: 'duplicate' });
    await expect(service.addTopic(meetingId, input, viewer)).resolves.toMatchObject({
      id: appearanceId,
    });
    await expect(service.appendWorkspaceUpdate(meetingId, signedUpdate(1), viewer))
      .rejects.toMatchObject({
        response: expect.objectContaining({ code: 'E2EE_UPDATE_REPLAY' }),
      });
  });

  it('atomically moves recurrence structure with an independent target update', async () => {
    await database.getRepository(Topic).update(topicId, {
      type: 'recurring',
      recurrenceFirstDueDate: '2026-09-01',
      recurrenceInterval: 1,
      recurrenceUnit: 'months',
      defaultSectionId: sectionId,
      defaultPosition: 1,
    });
    const appearances = database.getRepository(MeetingTopic);
    const source = await appearances.findOneByOrFail({ id: appearanceId });
    source.source = 'recurrence';
    source.contentEditedAt = null;
    await appearances.save(source);
    await database.getRepository(Meeting).save({
      id: targetMeetingId,
      titleEnvelope: Buffer.from([2]),
      titleCommitRevision: '1',
      date: '2026-09-20',
      beginTime: '19:00',
      status: 'planned',
    });
    await database.getRepository(MeetingDocumentSnapshot).save({
      id: targetSnapshotId,
      documentId: targetDocumentId,
      parentSnapshotId: null,
      parentEnvelopeHash: Buffer.alloc(32),
      coveredServerSequence: '0',
      coveredAuthorClocks: [],
      ockId,
      meetingCodec: 2,
      clientEpochId: epochId,
      snapshotClock: '1',
      envelope: Buffer.from([2]),
      envelopeFingerprint: Buffer.alloc(32, 1),
    });
    await database.getRepository(MeetingDocument).save({
      id: targetDocumentId,
      meetingId: targetMeetingId,
      envelopeFormat: 1,
      cryptoSuite: 1,
      meetingCodec: 2,
      activeSnapshotId: targetSnapshotId,
      currentServerSequence: '0',
      completedServerSequence: null,
    });

    await expect(service.addTopic(targetMeetingId, {
      id: targetAppearanceId,
      mutationId: targetMutationId,
      topicId,
      sectionId,
      source: 'recurrence',
      sourceAppearanceId: appearanceId,
      initialUpdateEnvelope: 'invalid',
    }, viewer)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E2EE_ENVELOPE_INVALID' }),
    });
    await expect(appearances.findOneBy({ id: appearanceId })).resolves.not.toBeNull();
    await expect(appearances.findOneBy({ id: targetAppearanceId })).resolves.toBeNull();

    await service.addTopic(targetMeetingId, {
      id: targetAppearanceId,
      mutationId: targetMutationId,
      topicId,
      sectionId,
      source: 'recurrence',
      sourceAppearanceId: appearanceId,
      initialUpdateEnvelope: signedUpdate(1, targetDocumentId, targetSnapshotId),
    }, viewer);

    await expect(appearances.findOneBy({ id: appearanceId })).resolves.toBeNull();
    await expect(appearances.findOneBy({ id: targetAppearanceId })).resolves.toMatchObject({
      meetingId: targetMeetingId,
      source: 'recurrence',
    });
    await expect(database.getRepository(MeetingDocumentMutation).findOneBy({ id: targetMutationId }))
      .resolves.toMatchObject({ sourceAppearanceId: appearanceId });
  });

  describe('multi-client completion over HTTP and WebSocket', () => {
    let app: INestApplication;
    let relay: MeetingCollaborationRelayService;
    let tickets: MeetingCollaborationTicketService;
    let currentUser: User;
    const clients: WebSocket[] = [];

    beforeAll(async () => {
      currentUser = await database.getRepository(User).findOneByOrFail({ id: userId });
      tickets = new MeetingCollaborationTicketService(database.getRepository(MeetingCollaborationTicket));
      const module = await Test.createTestingModule({
        controllers: [MeetingsController],
        providers: [
          { provide: MeetingsService, useValue: service },
          { provide: MeetingCollaborationTicketService, useValue: tickets },
        ],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.use(raw({ type: isE2eeMediaType, limit: '17mb' }));
      app.use((req: { user: User }, _res: unknown, next: () => void) => {
        req.user = currentUser;
        next();
      });
      await app.listen(0, '127.0.0.1');
      relay = new MeetingCollaborationRelayService(app.get(HttpAdapterHost), tickets, service, database, coordinator);
      relay.onApplicationBootstrap();
    });
    beforeEach(async () => {
      await database.getRepository(Meeting).update(meetingId, { status: 'in_progress', meetingLeaderId: userId, completedAt: null });
      await database.getRepository(MeetingDocument).update(documentId, { completedServerSequence: null });
    });
    afterEach(async () => {
      coordinator.abort(documentId);
      await Promise.all(clients.splice(0).map(async (client) => {
        if (client.readyState === WebSocket.CLOSED) return;
        const closed = once(client, 'close');
        client.close();
        await closed;
      }));
      // Let the existing delayed completed broadcast finish before resetting the fixture.
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    afterAll(async () => {
      relay?.onApplicationShutdown();
      await app?.close();
    });

    async function connect() {
      const ticket = await tickets.mint(meetingId, currentUser);
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const socket = new WebSocket(`ws://127.0.0.1:${port}${ticket.websocketPath}`);
      clients.push(socket);
      const frames: Array<Record<string, string>> = [];
      socket.on('message', (data) => frames.push(JSON.parse(data.toString())));
      await once(socket, 'open');
      socket.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket, documentId }));
      const wait = async (type: string) => {
        const deadline = Date.now() + 7_000;
        while (!frames.some((frame) => frame.type === type)) {
          if (Date.now() >= deadline) throw new Error(`Missing ${type}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return frames.splice(frames.findIndex((frame) => frame.type === type), 1)[0];
      };
      await wait('authenticated');
      return { socket, wait, send: (frame: object) => socket.send(JSON.stringify(frame)) };
    }

    async function settleClients(peers: Awaited<ReturnType<typeof connect>>[]) {
      for (const peer of peers) {
        const barrier = await peer.wait('completion-barrier');
        peer.send({ type: 'completion-drained', barrierId: barrier.barrierId });
      }
      for (const peer of peers) {
        const sequence = await peer.wait('completion-sequence');
        peer.send({ type: 'completion-confirmed', barrierId: sequence.barrierId, serverSequence: sequence.serverSequence });
      }
    }

    it('settles an edit from A before B completes and rejects every later write', async () => {
      const a = await connect();
      const b = await connect();
      const completion = request(app.getHttpServer()).post(`/api/meetings/${meetingId}/complete`).then((result) => result);
      const barrier = await a.wait('completion-barrier');
      const envelope = signedUpdate(3);
      a.send({ type: 'update', envelope });
      const acknowledged = await a.wait('acknowledged');
      expect(acknowledged.envelope).toBe(envelope);
      await b.wait('update');
      a.send({ type: 'completion-drained', barrierId: barrier.barrierId });
      await settleClients([b]);
      const sequence = await a.wait('completion-sequence');
      expect(sequence.serverSequence).toBe(acknowledged.serverSequence);
      a.send({ type: 'completion-confirmed', barrierId: sequence.barrierId, serverSequence: sequence.serverSequence });
      expect((await completion).status).toBe(201);
      const completed = await service.workspace(meetingId, currentUser);
      expect(completed?.updates).toEqual(expect.arrayContaining([expect.objectContaining({ envelope })]));
      expect(completed?.currentServerSequence).toBe(sequence.serverSequence);
      await expect(database.getRepository(MeetingDocument).findOneByOrFail({ id: documentId }))
        .resolves.toMatchObject({ completedServerSequence: sequence.serverSequence });
      a.send({ type: 'update', envelope: signedUpdate(4) });
      expect((await a.wait('rejected')).code).toBe('MEETING_COMPLETED_IMMUTABLE');
      await request(app.getHttpServer()).post(`/api/meetings/${meetingId}/workspace/updates`)
        .set('Content-Type', E2EE_MEDIA_TYPE).send(Buffer.from(signedUpdate(4), 'base64url')).expect(409);
      await expect(tickets.mint(meetingId, currentUser)).rejects.toThrow();
      await expect(database.getRepository(MeetingDocument).findOneByOrFail({ id: documentId }))
        .resolves.toMatchObject({ currentServerSequence: sequence.serverSequence });
    }, 15_000);

    it('times out a non-draining client and keeps the Meeting in progress', async () => {
      const a = await connect();
      await connect();
      const completion = request(app.getHttpServer()).post(`/api/meetings/${meetingId}/complete`).then((result) => result);
      const barrier = await a.wait('completion-barrier');
      a.send({ type: 'completion-drained', barrierId: barrier.barrierId });
      const response = await completion;
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('MEETING_COMPLETION_RETRY');
      expect((await a.wait('completion-released')).outcome).toBe('aborted');
      await expect(database.getRepository(Meeting).findOneByOrFail({ id: meetingId }))
        .resolves.toMatchObject({ status: 'in_progress' });
    }, 15_000);

    it('aborts on disconnect and succeeds on a later retry', async () => {
      const a = await connect();
      const b = await connect();
      const completion = request(app.getHttpServer()).post(`/api/meetings/${meetingId}/complete`).then((result) => result);
      await a.wait('completion-barrier');
      b.socket.close();
      expect((await completion).body.code).toBe('MEETING_COMPLETION_RETRY');
      await a.wait('completion-released');
      const retry = request(app.getHttpServer()).post(`/api/meetings/${meetingId}/complete`).then((result) => result);
      await settleClients([a]);
      expect((await retry).status).toBe(201);
    }, 15_000);
  });

  function signedUpdate(
    authorClock: number,
    targetDocument = documentId,
    targetSnapshot = snapshotId,
    targetEpoch = epochId,
    targetNoncePrefix = noncePrefix,
    targetSigningPrivateKey = signingPrivateKey,
  ): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(authorClock));
    const header = [
      uuidBytes(organizationId),
      uuidBytes(targetDocument),
      uuidBytes(targetSnapshot),
      uuidBytes(ockId),
      2,
      uuidBytes(targetEpoch),
      authorClock,
      Buffer.concat([targetNoncePrefix, counter]),
    ];
    const ciphertext = Buffer.alloc(32, 7);
    const signedMessage = Buffer.concat([
      Buffer.from('ElderFlow signed envelope v1\0'),
      Buffer.from(encoder.encode([1, 5, 1, header, ciphertext])),
    ]);
    const signature = sodium.crypto_sign_detached(
      signedMessage,
      targetSigningPrivateKey,
      'uint8array',
    );
    return Buffer.from(encoder.encode([1, 5, 1, header, ciphertext, signature]))
      .toString('base64url');
  }
});

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}
