import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { DiscriminatedTopicDto, TopicUpdateDto } from './dto/topic.dto';
import { TOPIC_TYPES, Topic, TopicType } from './topic.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { TopicUpdate } from './topic-update.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { Meeting } from '../meetings/meeting.entity';
import { normalizedMembershipTopicState } from './membership-topic-state';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { E2eeScalarService } from '../e2ee/e2ee-scalar.service';
import { isE2eeKeyOperator } from '../e2ee/e2ee-role-policy';
import { topicResponse, topicUpdateResponse } from './topic-response';
import {
  SCALAR_AGGREGATES,
  TOPIC_SCALAR_FIELDS,
  UPDATE_SCALAR_FIELDS,
} from '../e2ee/scalar-registry';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(MeetingTopic) private readonly appearances: Repository<MeetingTopic>,
    private readonly recurrence: RecurrenceService,
    private readonly scalars: E2eeScalarService,
  ) {}

  async findAll(filters: { status?: string; type?: string; responsibleUserId?: string; defaultSectionId?: string; dueOn?: string }, user: User) {
    const where: FindOptionsWhere<Topic> = {};
    if (filters.status) where.status = filters.status === 'active' ? In(['open', 'deferred']) : filters.status;
    if (filters.type) {
      this.assertSupportedType(filters.type);
      where.type = filters.type;
    }
    if (filters.responsibleUserId) where.responsibleUserId = filters.responsibleUserId;
    if (filters.defaultSectionId) where.defaultSectionId = filters.defaultSectionId;
    const topics = await this.topics.find({ where, relations: { responsibleUser: true, defaultSection: true }, order: { updatedAt: 'DESC' } });
    await Promise.all(topics.map((topic) => this.attachNextDueDate(topic)));
    const filtered = filters.dueOn
      ? topics.filter((topic) => topic.type === 'recurring'
        ? Boolean(topic.nextDueDate && topic.nextDueDate <= filters.dueOn!)
        : Boolean(topic.followUpDate && topic.followUpDate <= filters.dueOn!))
      : topics;
    return filtered.map((topic) => topicResponse(topic, user));
  }

  async findOne(id: string, user: User) {
    return topicResponse(await this.findOneEntity(id), user);
  }

  private async findOneEntity(id: string): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { responsibleUser: true, defaultSection: true },
    });
    if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    await this.attachNextDueDate(topic);
    return topic;
  }

  async create(input: DiscriminatedTopicDto, user: User) {
    this.scalars.assertContentUser(user);
    this.assertSupportedType(input.type);
    this.assertRecurrenceConfiguration(input.type, input);
    return this.topics.manager.transaction(async (manager) => {
      const topics = manager.getRepository(Topic);
      const existing = await topics.findOne({
        where: { id: input.id },
        relations: { responsibleUser: true, defaultSection: true },
      });
      if (existing) {
        const encryptedRetry = await this.validateTopicScalars(
          manager,
          user,
          input.id,
          input.protected,
          existing,
        );
        if (Object.keys(encryptedRetry).length || !this.sameCreateStructure(existing, input)) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            'TOPIC_CREATE_RETRY_MISMATCH',
            'Topic create identifier was retried with different content',
          );
        }
        return topicResponse(existing, user);
      }
      const values = normalizedMembershipTopicState(input.type, input, false, true);
      const encrypted = await this.validateTopicScalars(
        manager,
        user,
        input.id,
        input.protected,
        null,
      );
      const { protected: _protected, ...structural } = input;
      const topic = await topics.save(topics.create({
        ...structural,
        ...values,
        ...encrypted,
        ...this.normalizedRecurrenceState(input.type, input),
      }));
      if (topic.type === 'recurring') await this.recurrence.validate(manager, topic);
      return topicResponse(topic, user);
    });
  }

  async update(id: string, input: Partial<DiscriminatedTopicDto>, user: User) {
    this.scalars.assertContentUser(user);
    return this.topics.manager.transaction(async (manager) => {
      const topics = manager.getRepository(Topic);
      const topic = await topics.findOne({
        where: { id },
        relations: { responsibleUser: true, defaultSection: true },
        lock: { mode: 'pessimistic_write', tables: ['topics'] },
      });
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');

      if (input.type !== undefined) {
        this.assertSupportedType(input.type);
        if (input.type !== topic.type) {
          const hasAppearance = await manager.getRepository(MeetingTopic).exist({ where: { topicId: id } });
          if (hasAppearance) {
            throw codedHttpException(
              HttpStatus.CONFLICT,
              'TOPIC_TYPE_LOCKED',
              'Topic type cannot change after its first Meeting appearance',
            );
          }
        }
      }

      const effectiveType = input.type ?? topic.type;
      const converted = effectiveType !== topic.type;
      const candidate = { ...topic, ...input };
      this.assertRecurrenceConfiguration(effectiveType, candidate);
      const typeState = normalizedMembershipTopicState(effectiveType, candidate, converted, converted);
      if (converted && (!input.protected?.membershipProcessStatusEnvelope || !input.protected.godparentsEnvelope)) {
        throw codedHttpException(
          HttpStatus.BAD_REQUEST,
          'E2EE_TOPIC_TYPE_SCALARS_REQUIRED',
          'Topic type changes require fresh encrypted membership scalars',
        );
      }
      const encrypted = input.protected
        ? await this.validateTopicScalars(manager, user, id, input.protected, topic)
        : {};
      const { protected: _protected, ...structural } = input;
      const saved = await topics.save(Object.assign(
        topic,
        structural,
        typeState,
        encrypted,
        this.normalizedRecurrenceState(effectiveType, candidate),
      ));
      if (saved.type === 'recurring') await this.recurrence.validate(manager, saved);
      return topicResponse(saved, user);
    });
  }

  private assertSupportedType(type: string): asserts type is TopicType {
    if (!TOPIC_TYPES.includes(type as TopicType)) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'UNSUPPORTED_TOPIC_TYPE', 'Unsupported Topic type');
    }
  }

  private assertRecurrenceConfiguration(type: TopicType, input: Partial<Topic>): void {
    if (type !== 'recurring') return;
    if (
      !input.recurrenceFirstDueDate ||
      !this.isIsoDate(input.recurrenceFirstDueDate) ||
      !input.recurrenceInterval ||
      input.recurrenceInterval < 1 ||
      !['weeks', 'months'].includes(input.recurrenceUnit ?? '') ||
      !input.defaultSectionId
    ) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'RECURRENCE_CONFIGURATION_INVALID', 'Recurring Topic configuration is incomplete');
    }
  }

  private isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
  }

  private normalizedRecurrenceState(type: TopicType, input: Partial<Topic>): Pick<
    Topic,
    'recurrenceFirstDueDate' | 'recurrenceInterval' | 'recurrenceUnit' | 'followUpDate'
  > {
    return type === 'recurring'
      ? {
        recurrenceFirstDueDate: input.recurrenceFirstDueDate ?? null,
        recurrenceInterval: input.recurrenceInterval ?? null,
        recurrenceUnit: input.recurrenceUnit ?? null,
        followUpDate: null,
      }
      : {
        recurrenceFirstDueDate: null,
        recurrenceInterval: null,
        recurrenceUnit: null,
        followUpDate: input.followUpDate ?? null,
      };
  }

  private async attachNextDueDate(topic: Topic): Promise<void> {
    if (topic.type !== 'recurring') {
      topic.nextDueDate = null;
      return;
    }
    const appearances = await this.appearances.find({
      where: { topicId: topic.id }, relations: { meeting: true },
    });
    topic.nextDueDate = this.recurrence.nextDueDate(
      topic,
      appearances.map((appearance) => appearance.meeting!.date),
    );
  }

  async getUpdates(topicId: string, user: User) {
    await this.findOneEntity(topicId);
    const updates = await this.updates.find({ where: { topicId }, relations: { createdBy: true }, order: { date: 'DESC' } });
    return updates.map((update) => topicUpdateResponse(update, user));
  }

  async addUpdate(topicId: string, input: TopicUpdateDto, user: User) {
    this.scalars.assertContentUser(user);
    return this.topics.manager.transaction(async (manager) => {
      const topic = await manager.getRepository(Topic).findOne({
        where: { id: topicId },
        relations: { responsibleUser: true, defaultSection: true },
      });
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
      const updates = manager.getRepository(TopicUpdate);
      const existing = await updates.findOne({
        where: { id: input.id },
        relations: { createdBy: true },
      });
      const scalar = await this.scalars.validateWrite(
        manager,
        user,
        {
          aggregateType: SCALAR_AGGREGATES.update,
          recordId: input.id,
          fieldId: UPDATE_SCALAR_FIELDS.text,
        },
        input.textEnvelope,
        existing?.textCommitRevision ?? null,
      );
      if (existing) {
        if (!scalar.duplicate
          || existing.topicId !== topicId
          || existing.type !== (input.type ?? 'update')) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            'TOPIC_UPDATE_RETRY_MISMATCH',
            'Topic Update identifier was retried with different content',
          );
        }
        return topicUpdateResponse(existing, user);
      }
      const update = await updates.save(updates.create({
        id: input.id,
        topicId,
        createdById: user.id,
        date: new Date(),
        type: input.type ?? 'update',
        textEnvelope: scalar.envelope,
        textCommitRevision: scalar.commitRevision,
      }));
      return topicUpdateResponse(update, user);
    });
  }

  private async validateTopicScalars(
    manager: Parameters<E2eeScalarService['validateWrite']>[0],
    user: User,
    recordId: string,
    input: Partial<DiscriminatedTopicDto['protected']>,
    current: Topic | null,
  ): Promise<Partial<Topic>> {
    const result: Partial<Topic> = {};
    for (const { envelopeProperty, revisionProperty, fieldId } of Object.values(TOPIC_SCALAR_FIELDS)) {
      const encoded = input[envelopeProperty];
      if (!encoded) continue;
      const write = await this.scalars.validateWrite(
        manager,
        user,
        { aggregateType: SCALAR_AGGREGATES.topic, recordId, fieldId },
        encoded,
        current ? String(current[revisionProperty]) : null,
      );
      if (!write.duplicate || !current) {
        Object.assign(result, {
          [envelopeProperty]: write.envelope,
          [revisionProperty]: write.commitRevision,
        });
      }
    }
    return result;
  }

  private sameCreateStructure(topic: Topic, input: DiscriminatedTopicDto): boolean {
    const fields = [
      'type',
      'status',
      'followUpDate',
      'responsibleUserId',
      'membershipStatusSignal',
      'defaultSectionId',
      'defaultPosition',
      'recurrenceFirstDueDate',
      'recurrenceInterval',
      'recurrenceUnit',
    ] as const;
    return fields.every((field) => (topic[field] ?? null) === (input[field] ?? null));
  }

  async getAppearances(topicId: string, user: User, beforeMeetingId?: string) {
    await this.findOneEntity(topicId);
    const appearances = await this.appearances.find({
      where: { topicId }, relations: { meeting: true, section: true }, order: { meeting: { date: 'DESC' } },
    });
    const target = beforeMeetingId
      ? await this.topics.manager.findOneBy(Meeting, { id: beforeMeetingId })
      : null;
    if (beforeMeetingId && !target) {
      throw codedHttpException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', 'Meeting not found');
    }
    return appearances
      .filter((appearance) => !target || Boolean(appearance.meeting && [
        appearance.meeting.date,
        appearance.meeting.beginTime,
        appearance.meeting.id,
      ].join('|') < [target.date, target.beginTime, target.id].join('|')))
      .map((appearance) => ({
      id: appearance.id,
      meetingId: appearance.meetingId,
      topicId: appearance.topicId,
      sectionId: appearance.sectionId,
      position: appearance.position,
      plannedDuration: appearance.plannedDuration,
      status: appearance.status,
      deferredAt: appearance.deferredAt,
      meeting: appearance.meeting
        ? {
            id: appearance.meeting.id,
            protected: isE2eeKeyOperator(user.role) && Buffer.isBuffer(appearance.meeting.titleEnvelope)
              ? {
                  titleEnvelope: appearance.meeting.titleEnvelope.toString('base64url'),
                  titleCommitRevision: appearance.meeting.titleCommitRevision,
                }
              : null,
            date: appearance.meeting.date,
            beginTime: appearance.meeting.beginTime,
            status: appearance.meeting.status,
          }
        : null,
      section: appearance.section
        ? {
            id: appearance.section.id,
            name: appearance.section.name,
            position: appearance.section.position,
          }
        : null,
      }));
  }

  async recurrenceReconciliation(topicId: string, user: User) {
    this.scalars.assertContentUser(user);
    return this.recurrence.plan(this.topics.manager, topicId);
  }

  async getSkippedRecurrences(topicId: string, user: User) {
    await this.findOneEntity(topicId);
    const skips = await this.topics.manager.find(SkippedRecurrence, {
      where: { topicId }, relations: { meeting: true }, order: { meeting: { date: 'DESC' } },
    });
    return skips.map((skip) => ({
      id: skip.id,
      topicId: skip.topicId,
      meetingId: skip.meetingId,
      createdAt: skip.createdAt,
      meeting: skip.meeting
        ? {
            id: skip.meeting.id,
            protected: isE2eeKeyOperator(user.role) && Buffer.isBuffer(skip.meeting.titleEnvelope)
              ? {
                  titleEnvelope: skip.meeting.titleEnvelope.toString('base64url'),
                  titleCommitRevision: skip.meeting.titleCommitRevision,
                }
              : null,
            date: skip.meeting.date,
            beginTime: skip.meeting.beginTime,
            status: skip.meeting.status,
          }
        : null,
    }));
  }
}
