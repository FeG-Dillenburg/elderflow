import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { DiscriminatedTopicDto, TopicUpdateDto } from './dto/topic.dto';
import { TOPIC_TYPES, Topic, TopicType } from './topic.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { TopicUpdate } from './topic-update.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { Meeting } from '../meetings/meeting.entity';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(MeetingTopic) private readonly appearances: Repository<MeetingTopic>,
  ) {}

  findAll(filters: { status?: string; type?: string; responsibleUserId?: string; defaultSectionId?: string; dueOn?: string }): Promise<Topic[]> {
    const where: FindOptionsWhere<Topic> = {};
    if (filters.status) where.status = filters.status === 'active' ? In(['open', 'deferred']) : filters.status;
    if (filters.type) {
      this.assertSupportedType(filters.type);
      where.type = filters.type;
    }
    if (filters.responsibleUserId) where.responsibleUserId = filters.responsibleUserId;
    if (filters.defaultSectionId) where.defaultSectionId = filters.defaultSectionId;
    if (filters.dueOn) where.followUpDate = LessThanOrEqual(filters.dueOn);
    return this.topics.find({ where, relations: { responsibleUser: true, defaultSection: true }, order: { updatedAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Topic> {
    const topic = await this.topics.findOne({
      where: { id },
      relations: { responsibleUser: true, defaultSection: true },
    });
    if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    return topic;
  }

  async create(input: DiscriminatedTopicDto): Promise<Topic> {
    this.assertSupportedType(input.type);
    this.assertEnabledCreationType(input.type);
    return this.topics.save(this.topics.create({ ...input, isRecurring: false }));
  }

  async update(id: string, input: Partial<DiscriminatedTopicDto>): Promise<Topic> {
    return this.topics.manager.transaction(async (manager) => {
      const topics = manager.getRepository(Topic);
      const topic = await topics.findOne({
        where: { id },
        relations: { responsibleUser: true, defaultSection: true },
        lock: { mode: 'pessimistic_write' },
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
          this.assertEnabledCreationType(input.type);
        }
      }

      const converted = input.type !== undefined && input.type !== topic.type;
      return topics.save(Object.assign(topic, input, converted ? this.clearedTypeState(input.type!) : {}));
    });
  }

  private assertSupportedType(type: string): asserts type is TopicType {
    if (!TOPIC_TYPES.includes(type as TopicType)) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'UNSUPPORTED_TOPIC_TYPE', 'Unsupported Topic type');
    }
  }

  private assertEnabledCreationType(type: TopicType): void {
    if (type !== 'generic') {
      throw codedHttpException(
        HttpStatus.BAD_REQUEST,
        'TOPIC_TYPE_NOT_ENABLED',
        'This Topic type is not enabled for creation or conversion',
      );
    }
  }

  private clearedTypeState(type: TopicType): Pick<Topic, 'isRecurring'> {
    return { isRecurring: type === 'recurring' };
  }

  async getUpdates(topicId: string): Promise<TopicUpdate[]> {
    await this.findOne(topicId);
    return this.updates.find({ where: { topicId }, relations: { createdBy: true, meeting: true }, order: { date: 'DESC' } });
  }

  async addUpdate(topicId: string, input: TopicUpdateDto, user: User): Promise<TopicUpdate> {
    return this.topics.manager.transaction(async (manager) => {
      if (input.meetingId) {
        const meeting = await manager.findOne(Meeting, {
          where: { id: input.meetingId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!meeting) {
          throw codedHttpException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', 'Meeting not found');
        }
        if (meeting.status === 'completed') {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            'MEETING_COMPLETED_IMMUTABLE',
            'Completed Meeting content cannot be changed',
          );
        }
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
}
