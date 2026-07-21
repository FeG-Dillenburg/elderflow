import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { DiscriminatedTopicDto, TopicUpdateDto } from './dto/topic.dto';
import { TOPIC_TYPES, Topic, TopicType } from './topic.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { TopicUpdate } from './topic-update.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { lockedMutableMeeting } from '../meetings/meeting-mutation-boundary';
import { normalizedMembershipTopicState } from './membership-topic-state';
import { RecurrenceService } from '../recurrence/recurrence.service';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(MeetingTopic) private readonly appearances: Repository<MeetingTopic>,
    private readonly recurrence: RecurrenceService,
  ) {}

  async findAll(filters: { status?: string; type?: string; responsibleUserId?: string; defaultSectionId?: string; dueOn?: string }): Promise<Topic[]> {
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
    return filters.dueOn
      ? topics.filter((topic) => topic.type === 'recurring'
        ? Boolean(topic.nextDueDate && topic.nextDueDate <= filters.dueOn!)
        : Boolean(topic.followUpDate && topic.followUpDate <= filters.dueOn!))
      : topics;
  }

  async findOne(id: string): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { responsibleUser: true, defaultSection: true },
    });
    if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    await this.attachNextDueDate(topic);
    return topic;
  }

  async create(input: DiscriminatedTopicDto): Promise<Topic> {
    this.assertSupportedType(input.type);
    this.assertRecurrenceConfiguration(input.type, input);
    return this.topics.manager.transaction(async (manager) => {
      const topics = manager.getRepository(Topic);
      const values = normalizedMembershipTopicState(input.type, input, false, true);
      const topic = await topics.save(topics.create({
        ...input,
        ...values,
        ...this.normalizedRecurrenceState(input.type, input),
      }));
      await this.recurrence.reconcile(manager);
      return topic;
    });
  }

  async update(id: string, input: Partial<DiscriminatedTopicDto>): Promise<Topic> {
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
      const saved = await topics.save(Object.assign(
        topic,
        input,
        typeState,
        this.normalizedRecurrenceState(effectiveType, candidate),
      ));
      await this.recurrence.reconcile(manager);
      return saved;
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

  async getUpdates(topicId: string): Promise<TopicUpdate[]> {
    await this.findOne(topicId);
    return this.updates.find({ where: { topicId }, relations: { createdBy: true, meeting: true }, order: { date: 'DESC' } });
  }

  async addUpdate(topicId: string, input: TopicUpdateDto, user: User): Promise<TopicUpdate> {
    return this.topics.manager.transaction(async (manager) => {
      if (input.meetingId) {
        await lockedMutableMeeting(manager, input.meetingId);
      }

      const topic = await manager.getRepository(Topic).findOne({
        where: { id: topicId },
        relations: { responsibleUser: true, defaultSection: true },
      });
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
      const updates = manager.getRepository(TopicUpdate);
      return updates.save(updates.create({ ...input, topicId, createdById: user.id, date: new Date() }));
    });
  }

  async getAppearances(topicId: string): Promise<MeetingTopic[]> {
    await this.findOne(topicId);
    return this.appearances.find({
      where: { topicId }, relations: { meeting: true, section: true }, order: { meeting: { date: 'DESC' } },
    });
  }

  async getSkippedRecurrences(topicId: string): Promise<SkippedRecurrence[]> {
    await this.findOne(topicId);
    return this.topics.manager.find(SkippedRecurrence, {
      where: { topicId }, relations: { meeting: true }, order: { meeting: { date: 'DESC' } },
    });
  }
}
