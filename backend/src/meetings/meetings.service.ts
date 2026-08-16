import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { DataSource, In, LessThan, Repository } from "typeorm";
import { AgendaSection } from "../agenda-sections/agenda-section.entity";
import { E2eeScalarService } from "../e2ee/e2ee-scalar.service";
import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { MEETING_SCALAR_FIELDS, SCALAR_AGGREGATES } from "../e2ee/scalar-registry";
import { codedHttpException } from "../errors/coded-http.exception";
import { RecurrenceService } from "../recurrence/recurrence.service";
import { SkippedRecurrence } from "../recurrence/skipped-recurrence.entity";
import { Task } from "../tasks/task.entity";
import { assignedTaskSummaryRelations, assignedTaskSummarySelect } from "../tasks/task-projection";
import { taskSummaryResponse } from "../tasks/task-response";
import { Topic } from "../topics/topic.entity";
import { normalizedMembershipTopicState } from "../topics/membership-topic-state";
import { TopicResponse, topicResponse, topicUpdateResponse } from "../topics/topic-response";
import { TopicUpdate } from "../topics/topic-update.entity";
import { UpdateTopicFieldsDto } from "../topics/dto/topic.dto";
import { User } from "../users/user.entity";
import {
  MeetingDto,
  MeetingParticipantDto,
  MeetingTopicDto,
  MeetingTopicOrderItemDto,
  MeetingUpdateDto,
  UpdateMeetingTopicDto,
} from "./dto/meeting.dto";
import { MeetingDocumentMutation } from "./meeting-document-mutation.entity";
import { MeetingDocument } from "./meeting-document.entity";
import { MeetingDocumentService } from "./meeting-document.service";
import { MeetingSnapshotRegistry } from "./meeting-snapshot-contributor";
import { MeetingTopic } from "./meeting-topic.entity";
import { MeetingUser } from "./meeting-user.entity";
import { lockedMutableMeeting } from "./meeting-mutation-boundary";
import { meetingResponse } from "./meeting-response";
import { Meeting } from "./meeting.entity";
import { meetingCollaborationEvents } from "./meeting-collaboration-events";

@Injectable()
export class MeetingsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingUser) private readonly participants: Repository<MeetingUser>,
    @InjectRepository(MeetingTopic) private readonly meetingTopics: Repository<MeetingTopic>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(AgendaSection) private readonly sections: Repository<AgendaSection>,
    private readonly snapshots: MeetingSnapshotRegistry,
    private readonly recurrence: RecurrenceService,
    private readonly scalars: E2eeScalarService,
    private readonly documents: MeetingDocumentService,
  ) {}

  async complete(id: string, user: User) {
    const response = await this.dataSource.transaction(async (manager) => {
      const meeting = await manager.findOne(Meeting, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
      if (meeting.status !== "in_progress") {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "MEETING_COMPLETION_INVALID_STATUS",
          "Only an in-progress Meeting can be completed",
        );
      }
      if (user.id !== meeting.meetingLeaderId && user.id !== meeting.minuteTakerId) {
        throw codedHttpException(
          HttpStatus.FORBIDDEN,
          "MEETING_COMPLETION_FORBIDDEN",
          "Only the Meeting leader or Minute taker can complete this Meeting",
        );
      }
      const appearances = await manager.find(MeetingTopic, {
        where: { meetingId: id },
        relations: { topic: { responsibleUser: true } },
      });
      for (const appearance of appearances) {
        const topic = appearance.topic!;
        appearance.topicNameSnapshotEnvelope = topic.nameEnvelope;
        appearance.topicNameSnapshotCommitRevision = topic.nameCommitRevision;
        appearance.membershipProcessStatusSnapshotEnvelope = topic.membershipProcessStatusEnvelope;
        appearance.membershipProcessStatusSnapshotCommitRevision = topic.membershipProcessStatusCommitRevision;
        appearance.godparentsSnapshotEnvelope = topic.godparentsEnvelope;
        appearance.godparentsSnapshotCommitRevision = topic.godparentsCommitRevision;
        appearance.responsibleUserDisplayNameSnapshot = topic.responsibleUser
          ? `${topic.responsibleUser.firstName} ${topic.responsibleUser.lastName}`.trim()
          : null;
        await this.snapshots.apply(appearance, topic, manager);
      }
      if (appearances.length) await manager.save(MeetingTopic, appearances);
      const document = await manager.findOneByOrFail(MeetingDocument, { meetingId: id });
      document.completedServerSequence = document.currentServerSequence;
      await manager.save(document);
      meeting.status = "completed";
      meeting.completedAt = new Date();
      return meetingResponse(await manager.save(Meeting, meeting), user);
    });
    meetingCollaborationEvents.emit("completed", {
      meetingId: id,
    });
    return response;
  }

  async findAll(user: User) {
    const meetings = await this.meetings.find({
      relations: { meetingLeader: true, minuteTaker: true },
      order: { date: "DESC" },
    });
    return meetings.map((meeting) => meetingResponse(meeting, user));
  }

  async create(input: MeetingDto, user: User) {
    this.documents.assertContentUser(user);
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Meeting, { where: { id: input.id } });
      if (existing) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "MEETING_CREATE_RETRY_MISMATCH",
          "Meeting identifier is already used",
        );
      }
      const title = await this.scalars.validateWrite(
        manager,
        user,
        {
          aggregateType: SCALAR_AGGREGATES.meeting,
          recordId: input.id,
          fieldId: MEETING_SCALAR_FIELDS.title.fieldId,
        },
        input.protected.titleEnvelope,
        null,
      );
      const { protected: _protected, document, ...structural } = input;
      const meeting = await manager.save(Meeting, manager.create(Meeting, {
        ...structural,
        titleEnvelope: title.envelope,
        titleCommitRevision: title.commitRevision,
      }));
      await this.documents.createInitial(manager, user, meeting.id, document);
      return meetingResponse(meeting, user);
    });
  }

  async update(id: string, input: MeetingUpdateDto, user: User) {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await lockedMutableMeeting(manager, id);
      if (input.protected?.titleEnvelope) {
        const title = await this.scalars.validateWrite(
          manager,
          user,
          {
            aggregateType: SCALAR_AGGREGATES.meeting,
            recordId: id,
            fieldId: MEETING_SCALAR_FIELDS.title.fieldId,
          },
          input.protected.titleEnvelope,
          meeting.titleCommitRevision,
        );
        if (!title.duplicate) {
          meeting.titleEnvelope = title.envelope;
          meeting.titleCommitRevision = title.commitRevision;
        }
      }
      const { protected: _protected, ...structural } = input;
      Object.assign(meeting, structural);
      return meetingResponse(await manager.save(Meeting, meeting), user);
    });
  }

  async findOne(id: string, user: User) {
    const meeting = await this.meetings.findOne({
      where: { id },
      relations: { meetingLeader: true, minuteTaker: true },
    });
    if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
    const [participants, agenda, workspace] = await Promise.all([
      this.participants.find({ where: { meetingId: id }, relations: { user: true } }),
      this.meetingTopics.find({
        where: { meetingId: id },
        relations: { section: true, topic: { responsibleUser: true } },
        order: { section: { position: "ASC" }, position: "ASC" },
      }),
      isE2eeKeyOperator(user.role)
        ? this.documents.bootstrap(this.meetings.manager, user, id)
        : Promise.resolve(null),
    ]);
    const topicIds = agenda.map((item) => item.topicId);
    const [standaloneUpdates, tasks, earlierAppearances] = topicIds.length
      ? await Promise.all([
          this.updates.find({
            where: { topicId: In(topicIds) },
            relations: { createdBy: true },
            order: { date: "DESC" },
          }),
          this.tasks.find({
            where: { topicId: In(topicIds), status: In(["open", "in_progress"]) },
            relations: assignedTaskSummaryRelations,
            select: assignedTaskSummarySelect,
            order: { dueDate: "ASC" },
          }),
          this.meetingTopics.find({
            where: [
              { topicId: In(topicIds), meeting: { date: LessThan(meeting.date) } },
              {
                topicId: In(topicIds),
                meeting: { date: meeting.date, beginTime: LessThan(meeting.beginTime) },
              },
            ],
            relations: { meeting: true },
            order: { meeting: { date: "DESC", beginTime: "DESC" } },
          }),
        ])
      : [[], [], []] as [TopicUpdate[], Task[], MeetingTopic[]];
    const previousByTopic = new Map<string, MeetingTopic>();
    for (const appearance of earlierAppearances) {
      if (!previousByTopic.has(appearance.topicId)) previousByTopic.set(appearance.topicId, appearance);
    }
    const priorMeetingIds = isE2eeKeyOperator(user.role)
      ? [...new Set([...previousByTopic.values()].map((item) => item.meetingId))]
      : [];
    const priorDocuments = (await Promise.all(
      priorMeetingIds.map((priorMeetingId) =>
        this.documents.bootstrap(this.meetings.manager, user, priorMeetingId)),
    )).filter((value): value is NonNullable<typeof value> => value !== null);
    return {
      ...meetingResponse(meeting, user),
      participants: participants.map((participant) => ({
        id: participant.id,
        meetingId: participant.meetingId,
        userId: participant.userId,
        attendanceStatus: participant.attendanceStatus,
        user: participant.user ? {
          id: participant.user.id,
          email: participant.user.email,
          firstName: participant.user.firstName,
          lastName: participant.user.lastName,
          role: participant.user.role,
          language: participant.user.language,
        } : null,
      })),
      agenda: agenda.map((item) => this.appearanceResponse(
        item,
        standaloneUpdates,
        tasks,
        user,
        previousByTopic.get(item.topicId),
      )),
      workspace: workspace
        ? { ...workspace, priorDocuments }
        : null,
      collaboration: { available: meeting.status !== "completed" },
    };
  }

  async appendWorkspaceUpdate(
    meetingId: string,
    envelope: string,
    user: User,
    appearanceId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const result = await this.documents.appendUpdate(manager, user, meetingId, envelope);
      if (appearanceId) {
        const appearance = await manager.findOneBy(MeetingTopic, { id: appearanceId, meetingId });
        if (!appearance) {
          throw codedHttpException(
            HttpStatus.NOT_FOUND,
            "AGENDA_TOPIC_NOT_FOUND",
            "Agenda topic not found",
          );
        }
        if (!appearance.contentEditedAt) {
          appearance.contentEditedAt = new Date();
          await manager.save(MeetingTopic, appearance);
        }
      }
      return {
        status: result.duplicate ? "duplicate" : "accepted",
        updateId: result.update.id,
        clientEpochId: result.update.clientEpochId,
        authorClock: result.update.authorClock,
        serverSequence: result.update.serverSequence,
      };
    });
  }

  async workspace(meetingId: string, user: User) {
    if (!(await this.meetings.exists({ where: { id: meetingId } }))) {
      throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
    }
    return this.documents.bootstrap(this.meetings.manager, user, meetingId);
  }

  async compactWorkspace(meetingId: string, snapshotId: string, envelope: string, user: User) {
    const result = await this.dataSource.transaction((manager) =>
      this.documents.compact(manager, user, meetingId, snapshotId, envelope));
    meetingCollaborationEvents.emit("compacted", { meetingId });
    return result;
  }

  async addParticipant(meetingId: string, input: MeetingParticipantDto): Promise<MeetingUser> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const existing = await manager.findOneBy(MeetingUser, { meetingId, userId: input.userId });
      return manager.save(MeetingUser, existing
        ? Object.assign(existing, input)
        : manager.create(MeetingUser, { meetingId, ...input }));
    });
  }

  async removeParticipant(meetingId: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      await manager.delete(MeetingUser, { meetingId, userId });
    });
  }

  async addTopic(meetingId: string, input: MeetingTopicDto, user: User): Promise<MeetingTopic> {
    this.documents.assertContentUser(user);
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const requestFingerprint = this.meetingTopicRequestFingerprint(input);
      const replay = await manager.findOneBy(MeetingDocumentMutation, { id: input.mutationId });
      if (replay) {
        const appearance = await manager.findOneBy(MeetingTopic, {
          id: replay.appearanceId,
          meetingId,
        });
        const updateMatches = await this.documents.storedUpdateMatches(
          manager,
          replay.updateId,
          input.initialUpdateEnvelope,
        );
        const structureMatches = appearance
          && replay.meetingId === meetingId
          && replay.appearanceId === input.id
          && (replay.sourceAppearanceId ?? null) === (input.sourceAppearanceId ?? null)
          && replay.requestFingerprint.equals(requestFingerprint)
          && updateMatches;
        if (!structureMatches) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            "MEETING_MUTATION_RETRY_MISMATCH",
            "Meeting mutation was retried with different structure",
          );
        }
        return appearance!;
      }
      const [topic, section, existing, source] = await Promise.all([
        manager.findOne(Topic, { where: { id: input.topicId }, lock: { mode: "pessimistic_write" } }),
        manager.findOneBy(AgendaSection, { id: input.sectionId }),
        manager.findOneBy(MeetingTopic, { meetingId, topicId: input.topicId }),
        input.sourceAppearanceId
          ? manager.findOne(MeetingTopic, {
              where: { id: input.sourceAppearanceId },
              lock: { mode: "pessimistic_write" },
            })
          : Promise.resolve(null),
      ]);
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, "TOPIC_NOT_FOUND", "Topic not found");
      if (!section) throw codedHttpException(HttpStatus.NOT_FOUND, "AGENDA_SECTION_NOT_FOUND", "Agenda section not found");
      if (existing && existing.id !== source?.id) {
        throw codedHttpException(HttpStatus.CONFLICT, "AGENDA_TOPIC_CONFLICT", "Topic is already on this agenda");
      }
      const sourceMeeting = source
        ? await lockedMutableMeeting(manager, source.meetingId)
        : null;
      if (input.sourceAppearanceId && (
        !source
        || source.topicId !== input.topicId
        || source.source !== "recurrence"
        || source.contentEditedAt !== null
        || sourceMeeting?.status !== "planned"
      )) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "RECURRENCE_RECONCILIATION_CHANGED",
          "Recurring Topic structure changed; reload before reconciling",
        );
      }
      let recurrencePosition: number | undefined;
      if ((input.source ?? "manual") === "recurrence") {
        const plan = await this.recurrence.plan(manager, topic.id);
        const planned = plan.moves.find((move) =>
          move.meetingId === meetingId
          && move.sectionId === input.sectionId
          && (input.position === undefined || move.position === input.position)
          && (move.sourceAppearance?.id ?? null) === (input.sourceAppearanceId ?? null));
        if (!planned) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            "RECURRENCE_RECONCILIATION_CHANGED",
            "Recurring Topic structure changed; reload before reconciling",
          );
        }
        recurrencePosition = planned.position;
      }
      if (source) {
        await manager.remove(MeetingTopic, source);
        await this.normalizeSectionPositions(manager, source.meetingId, source.sectionId);
      }
      const items = await manager.find(MeetingTopic, {
        where: { meetingId, sectionId: input.sectionId },
        order: { position: "ASC" },
      });
      const position = input.position ?? recurrencePosition ?? items.length + 1;
      if (position > items.length + 1) {
        throw codedHttpException(HttpStatus.BAD_REQUEST, "AGENDA_POSITION_INVALID", "Position must be within the agenda section");
      }
      const shifted = items.filter((item) => item.position >= position);
      for (const item of shifted) item.position += 1;
      if (shifted.length) await manager.save(MeetingTopic, shifted);
      const opaque = await this.documents.appendUpdate(
        manager,
        user,
        meetingId,
        input.initialUpdateEnvelope,
      );
      const appearance = await manager.save(MeetingTopic, manager.create(MeetingTopic, {
        id: input.id,
        meetingId,
        topicId: input.topicId,
        sectionId: input.sectionId,
        position,
        plannedDuration: input.plannedDuration,
        status: "planned",
        source: input.source ?? "manual",
      }));
      await manager.save(MeetingDocumentMutation, manager.create(MeetingDocumentMutation, {
        id: input.mutationId,
        meetingId,
        appearanceId: appearance.id,
        sourceAppearanceId: input.sourceAppearanceId ?? null,
        updateId: opaque.update.id,
        requestFingerprint,
      }));
      return appearance;
    });
  }

  async reorderTopics(meetingId: string, input: MeetingTopicOrderItemDto[]): Promise<MeetingTopic[]> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const ids = input.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw codedHttpException(HttpStatus.BAD_REQUEST, "AGENDA_TOPIC_IDS_DUPLICATE", "Agenda topic IDs must be unique");
      const current = await manager.find(MeetingTopic, { where: { meetingId } });
      if (current.length !== input.length || current.some((item) => !ids.includes(item.id))) {
        throw codedHttpException(HttpStatus.CONFLICT, "AGENDA_CHANGED", "Agenda changed; reload before reordering");
      }
      const sectionIds = [...new Set(input.map((item) => item.sectionId))];
      if ((await manager.countBy(AgendaSection, { id: In(sectionIds) })) !== sectionIds.length) {
        throw codedHttpException(HttpStatus.BAD_REQUEST, "AGENDA_SECTION_INVALID", "An agenda section does not exist");
      }
      const bySection = new Map<string, number[]>();
      for (const item of input) bySection.set(item.sectionId, [...(bySection.get(item.sectionId) ?? []), item.position]);
      for (const positions of bySection.values()) {
        if ([...positions].sort((a, b) => a - b).some((position, index) => position !== index + 1)) {
          throw codedHttpException(HttpStatus.BAD_REQUEST, "AGENDA_POSITIONS_INVALID", "Positions must be consecutive and start at 1");
        }
      }
      const requested = new Map(input.map((item) => [item.id, item]));
      return manager.save(MeetingTopic, current.map((item) => Object.assign(item, requested.get(item.id)!)));
    });
  }

  async updateTopic(meetingId: string, id: string, input: UpdateMeetingTopicDto): Promise<MeetingTopic> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const item = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!item) throw codedHttpException(HttpStatus.NOT_FOUND, "AGENDA_TOPIC_NOT_FOUND", "Agenda topic not found");
      const { deferred, ...changes } = input;
      Object.assign(item, changes);
      if (deferred === true && !item.deferredAt) item.deferredAt = new Date();
      if (deferred === false) item.deferredAt = null;
      return manager.save(MeetingTopic, item);
    });
  }

  async updateTopicFields(
    meetingId: string,
    id: string,
    input: UpdateTopicFieldsDto,
    user: User,
  ): Promise<TopicResponse> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const appearance = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!appearance) throw codedHttpException(HttpStatus.NOT_FOUND, "AGENDA_TOPIC_NOT_FOUND", "Agenda topic not found");
      const topic = await manager.findOne(Topic, {
        where: { id: appearance.topicId },
        lock: { mode: "pessimistic_write" },
      });
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, "TOPIC_NOT_FOUND", "Topic not found");
      Object.assign(topic, input, normalizedMembershipTopicState(topic.type, { ...topic, ...input }));
      return topicResponse(await manager.save(Topic, topic), user);
    });
  }

  async removeTopic(meetingId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const appearance = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!appearance) throw codedHttpException(HttpStatus.NOT_FOUND, "AGENDA_TOPIC_NOT_FOUND", "Agenda topic not found");
      if (appearance.source === "recurrence") {
        const existing = await manager.findOneBy(SkippedRecurrence, { topicId: appearance.topicId, meetingId });
        if (!existing) await manager.save(SkippedRecurrence, manager.create(SkippedRecurrence, {
          topicId: appearance.topicId,
          meetingId,
        }));
      }
      await manager.remove(MeetingTopic, appearance);
      await this.normalizeSectionPositions(manager, meetingId, appearance.sectionId);
    });
  }

  async removeReconciledTopic(meetingId: string, id: string, user: User): Promise<void> {
    this.documents.assertContentUser(user);
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const appearance = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!appearance
        || appearance.source !== "recurrence"
        || appearance.contentEditedAt !== null) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "RECURRENCE_RECONCILIATION_CHANGED",
          "Recurring Topic structure changed; reload before reconciling",
        );
      }
      const plan = await this.recurrence.plan(manager, appearance.topicId);
      if (!plan.removals.some((removal) => removal.id === id && removal.meetingId === meetingId)) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "RECURRENCE_RECONCILIATION_CHANGED",
          "Recurring Topic structure changed; reload before reconciling",
        );
      }
      await manager.remove(MeetingTopic, appearance);
      await this.normalizeSectionPositions(manager, meetingId, appearance.sectionId);
    });
  }

  private async normalizeSectionPositions(
    manager: Parameters<typeof lockedMutableMeeting>[0],
    meetingId: string,
    sectionId: string,
  ): Promise<void> {
    const items = await manager.find(MeetingTopic, {
      where: { meetingId, sectionId },
      order: { position: "ASC", id: "ASC" },
    });
    const changed = items.filter((item, index) => item.position !== index + 1);
    for (const item of changed) item.position = items.indexOf(item) + 1;
    if (changed.length) await manager.save(MeetingTopic, changed);
  }

  async restoreRecurrence(meetingId: string, topicId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const skip = await manager.findOneBy(SkippedRecurrence, { topicId, meetingId });
      if (!skip) throw codedHttpException(HttpStatus.NOT_FOUND, "SKIPPED_RECURRENCE_NOT_FOUND", "Skipped recurrence not found");
      await manager.remove(SkippedRecurrence, skip);
    });
  }

  async suggestions(meetingId: string, future: boolean, user: User) {
    const meeting = await this.meetings.findOneBy({ id: meetingId });
    if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
    const existing = await this.meetingTopics.find({ where: { meetingId } });
    const candidates = await this.topics.find({
      where: { status: In(["open", "deferred"]) },
      relations: { responsibleUser: true, defaultSection: true },
      order: { followUpDate: "ASC", updatedAt: "DESC" },
    });
    const recurringIds = candidates.filter((topic) => topic.type === "recurring").map((topic) => topic.id);
    const [recurringAppearances, skipped] = await Promise.all([
      recurringIds.length
        ? this.meetingTopics.find({
          where: { topicId: In(recurringIds) },
          relations: { meeting: true },
        })
        : Promise.resolve([]),
      this.dataSource.manager.find(SkippedRecurrence, { where: { meetingId } }),
    ]);
    return candidates
      .filter((topic) => !existing.some((item) => item.topicId === topic.id))
      .filter((topic) => !skipped.some((item) => item.topicId === topic.id))
      .filter((topic) => {
        const dueDate = topic.type === "recurring"
          ? this.recurrence.nextDueDate(
            topic,
            recurringAppearances
              .filter((appearance) => appearance.topicId === topic.id && appearance.meeting)
              .map((appearance) => appearance.meeting!.date),
          )
          : topic.followUpDate;
        return future === Boolean(dueDate && dueDate > meeting.date);
      })
      .map((topic) => topicResponse(topic, user));
  }

  private meetingTopicRequestFingerprint(input: MeetingTopicDto): Buffer {
    return createHash("sha256").update(JSON.stringify({
      id: input.id,
      mutationId: input.mutationId,
      topicId: input.topicId,
      sectionId: input.sectionId,
      position: input.position ?? null,
      positionSupplied: input.position !== undefined,
      plannedDuration: input.plannedDuration ?? null,
      plannedDurationSupplied: input.plannedDuration !== undefined,
      source: input.source ?? null,
      sourceSupplied: input.source !== undefined,
      sourceAppearanceId: input.sourceAppearanceId ?? null,
      sourceAppearanceIdSupplied: input.sourceAppearanceId !== undefined,
      initialUpdateEnvelope: input.initialUpdateEnvelope,
    })).digest();
  }

  private appearanceResponse(
    item: MeetingTopic,
    updates: TopicUpdate[],
    tasks: Task[],
    user: User,
    previous?: MeetingTopic,
  ) {
    const {
      topicNameSnapshotEnvelope,
      topicNameSnapshotCommitRevision,
      membershipProcessStatusSnapshotEnvelope,
      membershipProcessStatusSnapshotCommitRevision,
      godparentsSnapshotEnvelope,
      godparentsSnapshotCommitRevision,
      topic,
      ...structural
    } = item;
    return {
      ...structural,
      previousAppearance: previous
        ? { appearanceId: previous.id, meetingId: previous.meetingId }
        : null,
      protectedSnapshot: topicNameSnapshotEnvelope
        ? {
            nameEnvelope: topicNameSnapshotEnvelope.toString("base64url"),
            nameCommitRevision: topicNameSnapshotCommitRevision,
            membershipProcessStatusEnvelope: membershipProcessStatusSnapshotEnvelope?.toString("base64url") ?? null,
            membershipProcessStatusCommitRevision: membershipProcessStatusSnapshotCommitRevision,
            godparentsEnvelope: godparentsSnapshotEnvelope?.toString("base64url") ?? null,
            godparentsCommitRevision: godparentsSnapshotCommitRevision,
          }
        : null,
      topic: topic
        ? {
            ...topicResponse(topic, user),
            updates: updates
              .filter((update) => update.topicId === item.topicId)
              .map((update) => topicUpdateResponse(update, user)),
            tasks: tasks
              .filter((task) => task.topicId === item.topicId)
              .map((task) => taskSummaryResponse(task, user)),
          }
        : undefined,
    };
  }
}
