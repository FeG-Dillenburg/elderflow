import { MentionWorkflowService } from "../src/meetings/mention-workflow.service";
import { MentionState, MentionCommentOperation } from "../src/meetings/mention-state.entity";
import { MentionWorkflow1720000026000 } from "../src/database/migrations/1720000026000-MentionWorkflow";
import { TopicsService } from "../src/topics/topics.service";
import { completionFixture } from "./completion-fixture";
import { MentionSnapshot } from "../src/meetings/mention-snapshot.entity";
import { E2eeKeyState } from "../src/e2ee/e2ee-key-state.entity";
import { E2eeClientEpoch } from "../src/e2ee/e2ee-client-epoch.entity";
import { E2eeScalarWrite } from "../src/e2ee/e2ee-scalar-write.entity";
import { MentionSnapshots1720000021000 } from "../src/database/migrations/1720000021000-MentionSnapshots";
import { MeetingTopicStatusDecisions1720000020000 } from '../src/database/migrations/1720000020000-MeetingTopicStatusDecisions';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MeetingsController } from '../src/meetings/meetings.controller';
import { MeetingCollaborationTicketService } from '../src/meetings/meeting-collaboration-ticket.service';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AgendaSection } from '../src/agenda-sections/agenda-section.entity';
import { MeetingTopic } from '../src/meetings/meeting-topic.entity';
import { MeetingUser } from '../src/meetings/meeting-user.entity';
import { Meeting } from '../src/meetings/meeting.entity';
import { MeetingSnapshotRegistry } from '../src/meetings/meeting-snapshot-contributor';
import { MeetingsService } from '../src/meetings/meetings.service';
import { MeetingCompactionCoordinator } from '../src/meetings/meeting-compaction-coordinator';
import { Task } from '../src/tasks/task.entity';
import { TopicUpdate } from '../src/topics/topic-update.entity';
import { Topic } from '../src/topics/topic.entity';
import { User } from '../src/users/user.entity';
import { RecurrenceService } from '../src/recurrence/recurrence.service';
import { SkippedRecurrence } from '../src/recurrence/skipped-recurrence.entity';
import { E2eeScalarService } from '../src/e2ee/e2ee-scalar.service';
import { MeetingDocumentService } from '../src/meetings/meeting-document.service';
import { MeetingDocument } from '../src/meetings/meeting-document.entity';
import { MeetingDocumentSnapshot } from '../src/meetings/meeting-document-snapshot.entity';
import { MeetingDocumentUpdate } from '../src/meetings/meeting-document-update.entity';
import { MeetingDocumentMutation } from '../src/meetings/meeting-document-mutation.entity';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const schema = `meeting_completion_${process.pid}_${Date.now()}`;

describeWithPostgres('Meeting completion with PostgreSQL (integration)', () => {
  let admin: DataSource;
  let database: DataSource;
  let service: MeetingsService;
  let workflow: MentionWorkflowService;
  let snapshots: MeetingSnapshotRegistry;
  const coordinator = new MeetingCompactionCoordinator();
  let leader: User;
  let meeting: Meeting;
  let appearance: MeetingTopic;
  let cryptoClient: Awaited<ReturnType<typeof completionFixture>>;

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url: databaseUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [
        MentionSnapshot, MentionState, MentionCommentOperation, E2eeKeyState, E2eeClientEpoch, E2eeScalarWrite,
        User, AgendaSection, Topic, TopicUpdate, Meeting, MeetingUser, MeetingTopic,
        Task, SkippedRecurrence, MeetingDocument, MeetingDocumentSnapshot,
        MeetingDocumentUpdate, MeetingDocumentMutation,
      ],
      synchronize: true,
    });
    await database.initialize();
    snapshots = new MeetingSnapshotRegistry();
    workflow = new MentionWorkflowService(database, new TopicsService(
      database.getRepository(Topic), database.getRepository(TopicUpdate),
      database.getRepository(MeetingTopic), new RecurrenceService(), new E2eeScalarService(),
    ));
    service = new MeetingsService(
      database,
      database.getRepository(Meeting),
      database.getRepository(MeetingUser),
      database.getRepository(MeetingTopic),
      database.getRepository(Topic),
      database.getRepository(TopicUpdate),
      database.getRepository(Task),
      database.getRepository(AgendaSection),
      snapshots,
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

  beforeEach(async () => {
    await database.query(`
      TRUNCATE TABLE
        "${schema}"."e2ee_scalar_writes",
        "${schema}"."e2ee_client_epochs",
        "${schema}"."e2ee_key_state",
        "${schema}"."mention_snapshots",
        "${schema}"."topic_updates",
        "${schema}"."meeting_document_mutations",
        "${schema}"."meeting_document_updates",
        "${schema}"."meeting_document_snapshots",
        "${schema}"."meeting_documents",
        "${schema}"."tasks",
        "${schema}"."meeting_topics",
        "${schema}"."meeting_users",
        "${schema}"."topics",
        "${schema}"."meetings",
        "${schema}"."agenda_sections",
        "${schema}"."users"
      CASCADE
    `);
    leader = await database.getRepository(User).save({
      email: 'leader@example.com',
      firstName: 'Meeting',
      lastName: 'Leader',
      role: 'user',
      language: null,
      passwordHash: null,
      archivedAt: null,
    });
    const responsible = await database.getRepository(User).save({
      email: 'responsible@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'user',
      language: null,
      passwordHash: null,
      archivedAt: null,
    });
    const section = await database.getRepository(AgendaSection).save({
      name: 'Main',
      position: 1,
      defaultTopicType: null,
    });
    const topic = await database.getRepository(Topic).save({
      nameEnvelope: Buffer.from([1]),
      nameCommitRevision: '1',
      descriptionEnvelope: Buffer.from([2]),
      descriptionCommitRevision: '1',
      membershipProcessStatusEnvelope: Buffer.from([3]),
      membershipProcessStatusCommitRevision: '1',
      godparentsEnvelope: Buffer.from([4]),
      godparentsCommitRevision: '1',
      type: 'generic',
      status: 'open',
      followUpDate: null,
      responsibleUserId: responsible.id,
      defaultSectionId: section.id,
      defaultPosition: 1,
      recurrenceFirstDueDate: null,
      recurrenceInterval: null,
      recurrenceUnit: null,
    });
    meeting = await database.getRepository(Meeting).save({
      titleEnvelope: Buffer.from([1]),
      titleCommitRevision: '1',
      date: '2026-07-19',
      beginTime: '19:30',
      status: 'in_progress',
      meetingLeaderId: leader.id,
      minuteTakerId: null,
    });
    await database.getRepository(MeetingDocument).save({
      id: '00000000-0000-4000-8000-000000000099',
      meetingId: meeting.id,
      envelopeFormat: 1,
      cryptoSuite: 1,
      meetingCodec: 2,
      activeSnapshotId: '00000000-0000-4000-8000-000000000098',
      currentServerSequence: '0',
      completedServerSequence: null,
    });
    appearance = await database.getRepository(MeetingTopic).save({
      meetingId: meeting.id,
      topicId: topic.id,
      sectionId: section.id,
      position: 1,
      plannedDuration: 15,
      status: 'planned',
      topicNameSnapshotEnvelope: null,
      topicNameSnapshotCommitRevision: null,
      responsibleUserDisplayNameSnapshot: null,
    });
  });

  beforeEach(async () => { cryptoClient = await completionFixture(database, service, leader); });

  it('upgrades existing PostgreSQL appearances without replaying legacy statuses', async () => {
    await database.getRepository(MeetingTopic).update(appearance.id, { status: 'done', deferredAt: new Date('2026-07-01T12:00:00Z') });
    const before = await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id });
    const runner = database.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query('ALTER TABLE meeting_topics DROP COLUMN topic_status_decision');
      await new MeetingTopicStatusDecisions1720000020000().up(runner);
    } finally {
      await runner.query('RESET search_path');
      await runner.release();
    }
    expect(await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id })).toEqual(before);
    await cryptoClient.complete(meeting.id);
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
  });

  describe('Agenda patch requests with real persistence', () => {
    let app: INestApplication;
    const patch = (input: object) => request(app.getHttpServer())
      .put(`/api/meetings/${meeting.id}/topics/${appearance.id}`).send(input);
    const reorder = (items: unknown[]) => request(app.getHttpServer())
      .put(`/api/meetings/${meeting.id}/topics/order`).send({ items });

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        controllers: [MeetingsController],
        providers: [
          { provide: MeetingsService, useValue: service },
          { provide: MeetingCollaborationTicketService, useValue: {} },
        ],
      }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({
        transform: true, whitelist: true, forbidNonWhitelisted: true,
      }));
      await app.init();
    });
    afterAll(async () => { await app?.close(); });

    it('persists only the final explicit decision and leaves the global Topic and structure unchanged', async () => {
      const done = await patch({ topicStatusDecision: 'done' }).expect(200);
      expect(done.body).toMatchObject({ topicStatusDecision: 'done', status: 'planned', plannedDuration: 15, position: 1 });
      expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
      await patch({ topicStatusDecision: 'deferred' }).expect(200);
      expect((await patch({}).expect(200)).body.topicStatusDecision).toBe('deferred');
      await patch({ topicStatusDecision: null }).expect(200);
      expect((await patch({}).expect(200)).body.topicStatusDecision).toBeNull();
      await cryptoClient.complete(meeting.id);
      expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
    });

    it('preserves a newer section and one-minute duration through stale status and duration requests', async () => {
      const section = await database.getRepository(AgendaSection).save({ name: 'Moved', position: 2 });
      const moved = { id: appearance.id, sectionId: section.id, position: 1 };
      await reorder([moved]).expect(200);
      await patch({ plannedDuration: 1 }).expect(200);
      const done = await patch({ status: 'done', deferred: true }).expect(200);
      expect(done.body).toMatchObject({ ...moved, plannedDuration: 1, status: 'done' });
      expect(done.body.deferredAt).toBeTruthy();
      const duration = await patch({ plannedDuration: 2 }).expect(200);
      expect(duration.body).toMatchObject({ ...moved, plannedDuration: 2, status: 'done' });
      expect(duration.body.deferredAt).toBe(done.body.deferredAt);
      await patch({ plannedDuration: null }).expect(200);
      expect((await patch({ deferred: false }).expect(200)).body).toMatchObject({
        ...moved, plannedDuration: null, status: 'done', deferredAt: null,
      });
    });

    it('serializes overlapping reorder, status and duration writes without losing unrelated fields', async () => {
      const section = await database.getRepository(AgendaSection).save({ name: 'Moved', position: 2 });
      const moved = { id: appearance.id, sectionId: section.id, position: 1 };
      await Promise.all([
        reorder([moved]).expect(200),
        patch({ status: 'done', deferred: true }).expect(200),
        patch({ plannedDuration: 1 }).expect(200),
      ]);
      const result = await patch({}).expect(200);
      expect(result.body).toMatchObject({ ...moved, status: 'done', plannedDuration: 1 });
      expect(result.body.deferredAt).toBeTruthy();
    });

    it('rejects legacy structural patches and malformed ordering without changing the agenda', async () => {
      await patch({ sectionId: appearance.sectionId, position: 1, status: 'done' }).expect(400);
      for (const items of [
        [{ id: appearance.id, sectionId: appearance.sectionId, position: 2 }],
        [{ id: appearance.id, sectionId: appearance.sectionId, position: 1 },
          { id: appearance.id, sectionId: appearance.sectionId, position: 2 }],
      ]) await reorder(items).expect(400);
      expect((await patch({}).expect(200)).body).toMatchObject({
        position: 1, plannedDuration: 15, status: 'planned',
      });
    });

    it('rejects patch and reorder requests once the meeting is completed', async () => {
      await database.getRepository(Meeting).update(meeting.id, { status: 'completed' });
      expect((await patch({ plannedDuration: 1 }).expect(409)).body.code)
        .toBe('MEETING_COMPLETED_IMMUTABLE');
      await reorder([{ id: appearance.id, sectionId: appearance.sectionId, position: 1 }]).expect(409);
    });
  });

  it.each(['done', 'deferred'] as const)('atomically applies %s after notes settle, retries failure, and never replays completion', async (decision) => {
    await service.updateTopic(meeting.id, appearance.id, { topicStatusDecision: decision === 'done' ? 'deferred' : 'done' });
    await service.updateTopic(meeting.id, appearance.id, { topicStatusDecision: decision });
    jest.spyOn(snapshots, 'apply').mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(cryptoClient.complete(meeting.id)).rejects.toThrow('snapshot failed');
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
    expect((await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id })).topicStatusDecision).toBe(decision);

    const documentId = '00000000-0000-4000-8000-000000000099';
    coordinator.join(documentId, 'client');
    const completion = cryptoClient.complete(meeting.id);
    while (!coordinator.current(documentId)) await new Promise((resolve) => setTimeout(resolve, 5));
    const barrierId = coordinator.current(documentId)!.barrierId;
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
    await database.getRepository(MeetingDocument).update({ meetingId: meeting.id }, { currentServerSequence: '1' });
    await coordinator.completionDrained(documentId, barrierId, 'client');
    coordinator.confirmCompletion(documentId, barrierId, 'client', '1');
    await completion;
    coordinator.disconnected(documentId, 'client');
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe(decision);
    expect((await database.getRepository(MeetingDocument).findOneByOrFail({ meetingId: meeting.id })).completedServerSequence).toBe('1');
    const completed = await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id });
    expect(completed.topicStatusDecision).toBe(decision);
    expect(Boolean(completed.deferredAt)).toBe(decision === 'deferred');
    await database.getRepository(Topic).update(appearance.topicId, { status: 'open' });
    await expect(cryptoClient.complete(meeting.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEETING_COMPLETION_INVALID_STATUS' }),
    });
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
  });

  it.each([null, 'deferred'] as const)('completes an older unfinished meeting later with decision %s in completion order', async (olderDecision) => {
    const older = await database.getRepository(Meeting).save({
      ...meeting, id: randomUUID(), date: '2026-07-01',
    });
    await database.getRepository(MeetingDocument).save({
      id: randomUUID(), activeSnapshotId: randomUUID(), meetingId: older.id, currentServerSequence: '0', envelopeFormat: 1, cryptoSuite: 1, meetingCodec: 2,
    });
    const olderAppearance = await database.getRepository(MeetingTopic).save({
      ...appearance, id: randomUUID(), meetingId: older.id, topicStatusDecision: olderDecision,
    });
    await service.updateTopic(meeting.id, appearance.id, { topicStatusDecision: 'done' });
    await cryptoClient.complete(meeting.id);
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('done');
    expect(await database.getRepository(MeetingTopic).findOneByOrFail({ id: olderAppearance.id })).toEqual(olderAppearance);
    await cryptoClient.complete(older.id);
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe(olderDecision ?? 'done');
    expect((await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id })).topicStatusDecision).toBe('done');
  });

  it('rolls back snapshots and status as one real transaction', async () => {
    jest.spyOn(snapshots, 'apply').mockRejectedValueOnce(new Error('snapshot failed'));

    await expect(cryptoClient.complete(meeting.id)).rejects.toThrow('snapshot failed');
    expect(coordinator.current('00000000-0000-4000-8000-000000000099')).toBeNull();
    expect(coordinator.beginExternalUpdate(meeting.id)).toBe(true);
    coordinator.endExternalUpdate(meeting.id);

    await expect(database.getRepository(Meeting).findOneByOrFail({ id: meeting.id }))
      .resolves.toMatchObject({ status: 'in_progress' });
    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({
        topicNameSnapshotEnvelope: null,
        responsibleUserDisplayNameSnapshot: null,
      });
  });

  it.each([
    ['authorization', 'MEETING_COMPLETION_FORBIDDEN'],
    ['status', 'MEETING_COMPLETION_INVALID_STATUS'],
    ['session', 'MEETING_COMPLETION_FORBIDDEN'],
  ])('revalidates %s after draining and releases the failed claim', async (change, code) => {
    await service.updateTopic(meeting.id, appearance.id, { topicStatusDecision: 'done' });
    const documentId = '00000000-0000-4000-8000-000000000099';
    coordinator.join(documentId, 'client');
    const completion = cryptoClient.complete(meeting.id);
    const rejected = expect(completion).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
    while (!coordinator.current(documentId)) await new Promise((resolve) => setTimeout(resolve, 5));
    const barrierId = coordinator.current(documentId)!.barrierId;
    if (change === 'authorization') await database.getRepository(Meeting).update(meeting.id, { meetingLeaderId: null });
    if (change === 'status') await database.getRepository(Meeting).update(meeting.id, { status: 'planned' });
    if (change === 'session') await database.getRepository(User).increment({ id: leader.id }, 'sessionVersion', 1);
    await coordinator.completionDrained(documentId, barrierId, 'client');
    coordinator.confirmCompletion(documentId, barrierId, 'client', '0');
    await rejected;
    expect((await database.getRepository(Topic).findOneByOrFail({ id: appearance.topicId })).status).toBe('open');
    expect((await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id })).topicStatusDecision).toBe('done');
    expect(coordinator.current(documentId)).toBeNull();
    coordinator.disconnected(documentId, 'client');
    await expect(database.getRepository(MeetingDocument).findOneByOrFail({ meetingId: meeting.id }))
      .resolves.toMatchObject({ completedServerSequence: null });
  });

  it('persists historical snapshots once and rejects a stale completion', async () => {
    await cryptoClient.complete(meeting.id);

    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({
        topicNameSnapshotEnvelope: Buffer.from([1]),
        topicNameSnapshotCommitRevision: '1',
        responsibleUserDisplayNameSnapshot: 'Ada Lovelace',
      });
    await expect(cryptoClient.complete(meeting.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEETING_COMPLETION_INVALID_STATUS' }),
    });
  });

  it('serializes completion against a concurrent Meeting-owned mutation', async () => {
    let releaseSnapshot!: () => void;
    let snapshotStarted!: () => void;
    const started = new Promise<void>((resolve) => { snapshotStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    jest.spyOn(snapshots, 'apply').mockImplementationOnce(async () => {
      snapshotStarted();
      await blocked;
    });

    const completion = cryptoClient.complete(meeting.id);
    await started;
    const mutation = service.updateTopic(meeting.id, appearance.id, {
      plannedDuration: appearance.plannedDuration,
      status: appearance.status,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseSnapshot();

    await expect(completion).resolves.toMatchObject({ status: 'completed' });
    await expect(mutation).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEETING_COMPLETED_IMMUTABLE' }),
    });
    await expect(database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id }))
      .resolves.toMatchObject({
        topicNameSnapshotEnvelope: Buffer.from([1]),
      });
  });
  it("upgrades populated appearances without changing content or backfilling completed history", async () => {
    const before = await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id });
    const runner = database.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query('DROP TABLE mention_comment_operations');
      await runner.query('DROP TABLE mention_states');
      await runner.query('DROP TABLE mention_snapshots');
      await runner.query('ALTER TABLE meeting_topics DROP COLUMN mentions_captured');
      await new MentionSnapshots1720000021000().up(runner);
      await new MentionWorkflow1720000026000().up(runner);
    } finally {
      await runner.query('RESET search_path');
      await runner.release();
    }
    expect(await database.getRepository(MeetingTopic).findOneByOrFail({ id: appearance.id })).toEqual(before);
    expect(await service.currentMentions(leader)).toEqual([]);
  });

  it("keeps historical rows while chronologically replacing and clearing current mentions", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ meetingId: meeting.id, topicId: appearance.topicId })]);
    const another = await database.getRepository(User).save({ ...leader, id: randomUUID(), email: 'other@example.com' });
    expect(await service.currentMentions(another)).toEqual([]);
    await expect(service.currentMentions({ ...leader, role: 'it-admin' })).rejects.toThrow();
    const addMeeting = async (date: string, id = randomUUID()) => {
      const next = await database.getRepository(Meeting).save({ ...meeting, id, date, status: 'in_progress' });
      await database.getRepository(MeetingDocument).save({
        id: randomUUID(), activeSnapshotId: randomUUID(), meetingId: id,
        currentServerSequence: '0', envelopeFormat: 1, cryptoSuite: 1, meetingCodec: 2,
      });
      await database.getRepository(MeetingTopic).save({ ...appearance, id: randomUUID(), meetingId: id });
      return next;
    };
    const older = await addMeeting('2020-01-01');
    await cryptoClient.complete(older.id, [leader.id]);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ meetingId: meeting.id })]);
    const [prior] = await service.currentMentions(leader);
    await workflow.setState(prior.id, true, leader);
    const newer = await addMeeting('2030-01-01');
    await cryptoClient.complete(newer.id);
    await expect(workflow.setState(prior.id, false, leader)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MENTION_STALE' }),
    });
    expect(await service.currentMentions(leader)).toEqual([]);
    expect(await database.getRepository(MentionSnapshot).count()).toBe(2);
    const tie = await addMeeting('2030-01-01', 'ffffffff-ffff-4fff-bfff-ffffffffffff');
    await cryptoClient.complete(tie.id, [leader.id]);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ meetingId: tie.id })]);
  });

  it("bounds the same authorized current-mention projection without changing lifecycle rules", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const repo = database.getRepository(MentionSnapshot);
    const original = await repo.findOneByOrFail({ userId: leader.id });
    for (let occurrence = 1; occurrence < 8; occurrence++) {
      await repo.save({ ...original, id: randomUUID(), occurrence });
    }
    expect(await service.currentMentions(leader, 9)).toHaveLength(8);
    await repo.save({ ...original, id: randomUUID(), occurrence: 8 });
    await repo.save({ ...original, id: randomUUID(), occurrence: 9 });
    const full = await service.currentMentions(leader);
    const bounded = await service.currentMentions(leader, 9);
    expect(bounded).toHaveLength(9);
    expect(bounded).toEqual(full.slice(0, 9));
    expect(bounded.slice(0, 8)).toEqual(full.slice(0, 8));
    await expect(service.currentMentions({ ...leader, role: 'it-admin' }, 9)).rejects.toThrow();
    expect(await service.currentMentions({ ...leader, id: randomUUID() }, 9)).toEqual([]);
  });

  it("persists only the owner's workflow state, keeps snapshots immutable, and upgrades existing mentions as Open", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    const snapshotsBefore = await database.getRepository(MentionSnapshot).find();
    const meetingBefore = await database.getRepository(Meeting).findOneByOrFail({ id: meeting.id });
    const runner = database.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query('DROP TABLE mention_comment_operations');
      await runner.query('DROP TABLE mention_states');
      await new MentionWorkflow1720000026000().up(runner);
    } finally {
      await runner.query('RESET search_path');
      await runner.release();
    }
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ id: mention.id, done: false })]);
    await expect(workflow.setState(mention.id, true, { ...leader, id: randomUUID() })).rejects.toThrow();
    await workflow.setState(mention.id, true, leader);
    await workflow.setState(mention.id, true, leader);
    expect(await service.currentMentions(leader, 9, true)).toEqual([]);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ done: true })]);
    await workflow.setState(mention.id, false, leader);
    expect(await service.currentMentions(leader, 9, true)).toHaveLength(1);
    expect(await database.getRepository(MentionSnapshot).find()).toEqual(snapshotsBefore);
    expect(await database.getRepository(Meeting).findOneByOrFail({ id: meeting.id })).toEqual(meetingBefore);
  });

  it("atomically adds one encrypted standalone Update and retries without completing a reopened mention", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    const id = randomUUID();
    const comment = { id, textEnvelope: cryptoClient.envelope(id, 257) };
    await workflow.setState(mention.id, true, leader, comment);
    await workflow.setState(mention.id, true, leader, comment);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ done: true })]);
    const updates = await database.getRepository(TopicUpdate).find();
    expect(updates).toEqual([expect.objectContaining({ id, topicId: mention.topicId, createdById: leader.id, type: 'update' })]);
    expect(updates[0].textEnvelope).toEqual(Buffer.from(comment.textEnvelope, 'base64url'));
    const conflictingId = randomUUID();
    await expect(workflow.setState(mention.id, true, leader, {
      id: conflictingId, textEnvelope: cryptoClient.envelope(conflictingId, 257),
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'MENTION_ALREADY_DONE' }) });
    await workflow.setState(mention.id, false, leader);
    expect(await workflow.setState(mention.id, true, leader, comment)).toMatchObject({ done: false });
    expect(await database.getRepository(TopicUpdate).find()).toEqual(updates);
    expect(await service.currentMentions(leader, 9, true)).toHaveLength(1);
  });

  it("rolls back the Update and scalar ledger if the state write fails, then safely retries", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    const id = randomUUID();
    const comment = { id, textEnvelope: cryptoClient.envelope(id, 257) };
    await database.query(`ALTER TABLE "${schema}".mention_states ADD CONSTRAINT fail_state CHECK (NOT done)`);
    try {
      await expect(workflow.setState(mention.id, true, leader, comment)).rejects.toThrow();
      expect(await database.getRepository(TopicUpdate).count()).toBe(0);
      expect(await database.getRepository(MentionCommentOperation).count()).toBe(0);
      expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ done: false })]);
    } finally {
      await database.query(`ALTER TABLE "${schema}".mention_states DROP CONSTRAINT fail_state`);
    }
    await workflow.setState(mention.id, true, leader, comment);
    expect(await database.getRepository(TopicUpdate).count()).toBe(1);
  });

  it("serializes competing comment operations so exactly one succeeds", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    const comments = [randomUUID(), randomUUID()].map((id) => ({ id, textEnvelope: cryptoClient.envelope(id, 257) }));
    const results = await Promise.allSettled(comments.map((comment) => workflow.setState(mention.id, true, leader, comment)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ response: expect.objectContaining({ code: 'MENTION_ALREADY_DONE' }) }) }),
    ]);
    expect(await database.getRepository(TopicUpdate).count()).toBe(1);
    expect(await database.getRepository(MentionCommentOperation).count()).toBe(1);
  });

  it("rechecks currentness after waiting for a replacing Meeting and rejects its stale comment", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    const next = await database.getRepository(Meeting).save({ ...meeting, id: randomUUID(), date: '2030-01-01', status: 'in_progress' });
    await database.getRepository(MeetingDocument).save({
      id: randomUUID(), activeSnapshotId: randomUUID(), meetingId: next.id,
      currentServerSequence: '0', envelopeFormat: 1, cryptoSuite: 1, meetingCodec: 2,
    });
    await database.getRepository(MeetingTopic).save({ ...appearance, id: randomUUID(), meetingId: next.id });
    const input = await cryptoClient.prepare(next.id, [leader.id]);
    let reached!: () => void;
    let release!: () => void;
    const reachedSnapshot = new Promise<void>((resolve) => { reached = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalApply = snapshots.apply.bind(snapshots);
    const spy = jest.spyOn(snapshots, 'apply').mockImplementationOnce(async (...args) => {
      reached();
      await gate;
      return originalApply(...args);
    });
    const completion = service.complete(next.id, leader, input);
    await reachedSnapshot;
    const id = randomUUID();
    const resolving = workflow.setState(mention.id, true, leader, { id, textEnvelope: cryptoClient.envelope(id, 257) });
    // Observe the rejection immediately so it never becomes an unhandled promise.
    const rejected = expect(resolving).rejects.toMatchObject({ response: expect.objectContaining({ code: 'MENTION_STALE' }) });
    release();
    await completion;
    await rejected;
    spy.mockRestore();
    expect(await database.getRepository(TopicUpdate).count()).toBe(0);
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ meetingId: next.id, done: false })]);
  });

  it("filters Open before the dashboard limit even when Done mentions sort first", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const repo = database.getRepository(MentionSnapshot);
    const original = await repo.findOneByOrFail({ userId: leader.id });
    await workflow.setState(original.id, true, leader);
    for (let occurrence = 1; occurrence <= 9; occurrence++) {
      await repo.save({ ...original, id: randomUUID(), occurrence });
    }
    expect(await service.currentMentions(leader, 9, true)).toHaveLength(9);
    expect((await service.currentMentions(leader, 9, true)).every((row) => !row.done)).toBe(true);
    const open = await service.currentMentions(leader, 9, true);
    await workflow.setState(open[0].id, true, leader);
    expect(await service.currentMentions(leader, 9, true)).toHaveLength(8);
  });

  it("rejects invalid ciphertext, revoked epochs, and comment writes by readers without changing workflow state", async () => {
    await cryptoClient.complete(meeting.id, [leader.id]);
    const [mention] = await service.currentMentions(leader);
    await expect(workflow.setState(mention.id, true, leader, { id: randomUUID(), textEnvelope: 'invalid' })).rejects.toThrow();
    await database.getRepository(User).update(leader.id, { role: 'guest' });
    await expect(workflow.setState(mention.id, true, leader)).rejects.toThrow();
    await expect(service.currentMentions({ ...leader, role: 'guest' })).rejects.toThrow();
    const id = randomUUID();
    const comment = { id, textEnvelope: cryptoClient.envelope(id, 257) };
    await expect(workflow.setState(mention.id, true, leader, comment)).rejects.toThrow();
    await database.getRepository(User).update(leader.id, { role: 'user' });
    await database.getRepository(E2eeClientEpoch).update(cryptoClient.epochId, { revokedAt: new Date() });
    await expect(workflow.setState(mention.id, true, leader, comment)).rejects.toThrow();
    expect(await service.currentMentions(leader)).toEqual([expect.objectContaining({ done: false })]);
    expect(await database.getRepository(TopicUpdate).count()).toBe(0);
  });

  it("rolls back mention rows together with failed completion and permits a clean retry", async () => {
    jest.spyOn(snapshots, 'apply').mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(cryptoClient.complete(meeting.id, [leader.id])).rejects.toThrow('snapshot failed');
    expect(await service.currentMentions(leader)).toEqual([]);
    expect(await database.getRepository(MentionSnapshot).count()).toBe(0);
    await cryptoClient.complete(meeting.id, [leader.id]);
    expect(await service.currentMentions(leader)).toHaveLength(1);
  });

  it.each(['sequence', 'context', 'user', 'epoch', 'appearance', 'signature'])("rejects invalid %s without completing", async (invalid) => {
    const input = await cryptoClient.prepare(meeting.id, [leader.id]);
    if (invalid === 'sequence') input.serverSequence = '999';
    if (invalid === 'context') input.appearances[0].mentions[0].id = randomUUID();
    if (invalid === 'user') input.appearances[0].mentions[0].userId = randomUUID();
    if (invalid === 'epoch') await database.getRepository(E2eeClientEpoch).update(cryptoClient.epochId, { revokedAt: new Date() });
    if (invalid === 'appearance') input.appearances = [];
    if (invalid === 'signature') {
      const bytes = Buffer.from(input.appearances[0].mentions[0].contextEnvelope, 'base64url');
      bytes[bytes.length - 1] ^= 1;
      input.appearances[0].mentions[0].contextEnvelope = bytes.toString('base64url');
    }
    await expect(service.complete(meeting.id, leader, input)).rejects.toThrow();
    service.cancelCompletion(meeting.id, input.barrierId, leader);
    expect(await service.currentMentions(leader)).toEqual([]);
    expect((await database.getRepository(Meeting).findOneByOrFail({ id: meeting.id })).status).toBe('in_progress');
    expect(await database.getRepository(MentionSnapshot).count()).toBe(0);
  });

  it("aborts a disconnected completion even while its transaction is writing snapshots", async () => {
    const documentId = (await database.getRepository(MeetingDocument).findOneByOrFail({ meetingId: meeting.id })).id;
    coordinator.join(documentId, 'completer');
    const pending = cryptoClient.prepare(meeting.id, [leader.id]);
    while (!coordinator.current(documentId)) await new Promise((resolve) => setTimeout(resolve, 5));
    const barrierId = coordinator.current(documentId)!.barrierId;
    await coordinator.completionDrained(documentId, barrierId, 'completer');
    coordinator.confirmCompletion(documentId, barrierId, 'completer', '0');
    const input = await pending;
    jest.spyOn(snapshots, 'apply').mockImplementationOnce(async () => { coordinator.disconnected(documentId, 'completer'); });
    await expect(service.complete(meeting.id, leader, input)).rejects.toThrow();
    expect(await database.getRepository(MentionSnapshot).count()).toBe(0);
    expect((await database.getRepository(Meeting).findOneByOrFail({ id: meeting.id })).status).toBe('in_progress');
  });

});
