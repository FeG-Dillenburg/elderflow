import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { TopicDto, TopicUpdateDto } from './dto/topic.dto';
import { Topic } from './topic.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { TopicUpdate } from './topic-update.entity';
import { MeetingTopic } from '../meetings/meeting-topic.entity';

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
    if (filters.type) where.type = filters.type;
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

  create(input: TopicDto): Promise<Topic> {
    return this.topics.save(this.topics.create(input));
  }

  async update(id: string, input: Partial<TopicDto>): Promise<Topic> {
    const topic = await this.findOne(id);
    return this.topics.save(Object.assign(topic, input));
  }

  async getUpdates(topicId: string): Promise<TopicUpdate[]> {
    await this.findOne(topicId);
    return this.updates.find({ where: { topicId }, relations: { createdBy: true, meeting: true }, order: { date: 'DESC' } });
  }

  async addUpdate(topicId: string, input: TopicUpdateDto, user: User): Promise<TopicUpdate> {
    await this.findOne(topicId);
    return this.updates.save(this.updates.create({ ...input, topicId, createdById: user.id, date: new Date() }));
  }

  async getAppearances(topicId: string): Promise<MeetingTopic[]> {
    await this.findOne(topicId);
    return this.appearances.find({
      where: { topicId }, relations: { meeting: true, section: true }, order: { meeting: { date: 'DESC' } },
    });
  }
}
