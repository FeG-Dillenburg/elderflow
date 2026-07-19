import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { Task } from '../tasks/task.entity';
import { Topic } from '../topics/topic.entity';
import { TopicUpdate } from '../topics/topic-update.entity';
import { MeetingDto, MeetingParticipantDto, MeetingTopicDto, MeetingTopicOrderItemDto, UpdateMeetingTopicDto } from './dto/meeting.dto';
import { MeetingTopic } from './meeting-topic.entity';
import { MeetingUser } from './meeting-user.entity';
import { Meeting } from './meeting.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { MeetingSnapshotRegistry } from './meeting-snapshot-contributor';
import { lockedMutableMeeting } from './meeting-mutation-boundary';

export interface MeetingDetail extends Meeting {
  participants: MeetingUser[];
  agenda: MeetingTopic[];
}

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
  ) {}

  async complete(id: string, user: User): Promise<Meeting> {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await manager.findOne(Meeting, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!meeting) {
        throw codedHttpException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', 'Meeting not found');
      }
      if (meeting.status !== 'in_progress') {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          'MEETING_COMPLETION_INVALID_STATUS',
          'Only an in-progress Meeting can be completed',
        );
      }
      if (user.id !== meeting.meetingLeaderId && user.id !== meeting.minuteTakerId) {
        throw codedHttpException(
          HttpStatus.FORBIDDEN,
          'MEETING_COMPLETION_FORBIDDEN',
          'Only the Meeting leader or Minute taker can complete this Meeting',
        );
      }

      const appearances = await manager.find(MeetingTopic, {
        where: { meetingId: id },
        relations: { topic: { responsibleUser: true } },
      });
      for (const appearance of appearances) {
        const topic = appearance.topic!;
        appearance.topicNameSnapshot = topic.name;
        appearance.responsibleUserDisplayNameSnapshot = topic.responsibleUser
          ? `${topic.responsibleUser.firstName} ${topic.responsibleUser.lastName}`.trim()
          : null;
        await this.snapshots.apply(appearance, topic, manager);
      }
      if (appearances.length) {
        await manager.save(MeetingTopic, appearances);
      }
      meeting.status = 'completed';
      return manager.save(Meeting, meeting);
    });
  }

  findAll(): Promise<Meeting[]> {
    return this.meetings.find({ relations: { meetingLeader: true, minuteTaker: true }, order: { date: 'DESC' } });
  }

  async create(input: MeetingDto): Promise<Meeting> {
    if (input.status === 'completed') {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        'MEETING_STATUS_TRANSITION_INVALID',
        'A Meeting can only become completed through the completion action',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const meeting = await manager.save(Meeting, manager.create(Meeting, input));
      const recurringTopics = await manager.find(Topic, {
        where: { type: 'recurring', status: 'open' },
        order: { defaultPosition: 'ASC' },
      });
      const fallbackSection = await manager.findOne(AgendaSection, { where: { isDefault: true }, order: { position: 'ASC' } });
      for (const [index, topic] of recurringTopics.entries()) {
        const sectionId = topic.defaultSectionId ?? fallbackSection?.id;
        if (sectionId) {
          await manager.findOne(Topic, { where: { id: topic.id }, lock: { mode: 'pessimistic_write' } });
          await manager.save(MeetingTopic, manager.create(MeetingTopic, {
            meetingId: meeting.id,
            topicId: topic.id,
            sectionId,
            position: topic.defaultPosition ?? index + 1,
            status: 'planned',
          }));
        }
      }
      return meeting;
    });
  }

  async update(id: string, input: MeetingDto): Promise<Meeting> {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await lockedMutableMeeting(manager, id);
      if (input.status === 'completed') {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          'MEETING_STATUS_TRANSITION_INVALID',
          'Complete an in-progress Meeting through the completion action',
        );
      }
      return manager.save(Meeting, Object.assign(meeting, input));
    });
  }

  async findOne(id: string): Promise<MeetingDetail> {
    const meeting = await this.meetings.findOne({
      where: { id }, relations: { meetingLeader: true, minuteTaker: true },
    });
    if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', 'Meeting not found');
    const [participants, agenda] = await Promise.all([
      this.participants.find({ where: { meetingId: id }, relations: { user: true } }),
      this.meetingTopics.find({
        where: { meetingId: id },
        relations: { section: true, topic: { responsibleUser: true } },
        order: { section: { position: 'ASC' }, position: 'ASC' },
      }),
    ]);
    const topicIds = agenda.map((item) => item.topicId);
    if (topicIds.length) {
      const [updates, tasks] = await Promise.all([
        this.updates.find({
          where: {
            topicId: In(topicIds),
            ...(meeting.status === 'completed' ? { meetingId: id } : {}),
          },
          relations: { createdBy: true, meeting: true },
          order: { date: 'DESC' },
        }),
        this.tasks.find({
          where: { topicId: In(topicIds), status: In(['open', 'in_progress']) }, relations: { assignedTo: true }, order: { dueDate: 'ASC' },
        }),
      ]);
      for (const item of agenda) {
        Object.assign(item.topic!, {
          updates: updates.filter((update) =>
            update.topicId === item.topicId &&
            (meeting.status !== 'completed' || update.meetingId === id)),
          tasks: tasks.filter((task) => task.topicId === item.topicId),
        });
      }
    }
    if (meeting.status === 'completed') {
      for (const item of agenda) {
        if (item.topic) {
          Object.assign(item.topic, {
            name: item.topicNameSnapshot ?? item.topic.name,
            responsibleUser: null,
          });
        }
      }
    }
    return Object.assign(meeting, { participants, agenda });
  }

  async addParticipant(meetingId: string, input: MeetingParticipantDto): Promise<MeetingUser> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const existing = await manager.findOneBy(MeetingUser, { meetingId, userId: input.userId });
      if (existing) return manager.save(MeetingUser, Object.assign(existing, input));
      return manager.save(MeetingUser, manager.create(MeetingUser, { meetingId, ...input }));
    });
  }

  async removeParticipant(meetingId: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      await manager.delete(MeetingUser, { meetingId, userId });
    });
  }

  async addTopic(meetingId: string, input: MeetingTopicDto): Promise<MeetingTopic> {
    return this.dataSource.transaction(async (manager) => {
      const meeting = await lockedMutableMeeting(manager, meetingId);
      const topic = await manager.findOne(Topic, {
        where: { id: input.topicId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
      const section = await manager.findOneBy(AgendaSection, { id: input.sectionId });
      if (!section) throw codedHttpException(HttpStatus.NOT_FOUND, 'AGENDA_SECTION_NOT_FOUND', 'Agenda section not found');
      const existing = await manager.findOneBy(MeetingTopic, { meetingId, topicId: input.topicId });
      if (existing) throw codedHttpException(HttpStatus.CONFLICT, 'AGENDA_TOPIC_CONFLICT', 'Topic is already on this agenda');
      const items = await manager.find(MeetingTopic, {
        where: { meetingId, sectionId: input.sectionId }, order: { position: 'ASC' },
      });
      const position = input.position ?? (items[items.length - 1]?.position ?? 0) + 1;
      if (input.position !== undefined && position > items.length + 1) {
        throw codedHttpException(HttpStatus.BAD_REQUEST, 'AGENDA_POSITION_INVALID', 'Position must be within the agenda section');
      }
      const shifted = items.filter((item) => item.position >= position);
      for (const item of shifted) item.position += 1;
      if (shifted.length) await manager.save(MeetingTopic, shifted);
      const previousPersonAppearance = topic.type === 'person' && input.agendaNote === undefined
        ? await manager.findOne(MeetingTopic, {
          where: [
            {
              topicId: topic.id,
              meeting: { date: LessThan(meeting.date) },
            },
            {
              topicId: topic.id,
              meeting: {
                date: meeting.date,
                beginTime: LessThan(meeting.beginTime),
              },
            },
          ],
          relations: { meeting: true },
          order: { meeting: { date: 'DESC', beginTime: 'DESC' } },
        })
        : null;
      return manager.save(MeetingTopic, manager.create(MeetingTopic, {
        ...input,
        meetingId,
        position,
        status: 'planned',
        agendaNote: input.agendaNote !== undefined
          ? input.agendaNote
          : previousPersonAppearance?.agendaNote ?? null,
      }));
    });
  }

  async reorderTopics(meetingId: string, input: MeetingTopicOrderItemDto[]): Promise<MeetingTopic[]> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const ids = input.map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw codedHttpException(HttpStatus.BAD_REQUEST, 'AGENDA_TOPIC_IDS_DUPLICATE', 'Agenda topic IDs must be unique');
      const current = await manager.find(MeetingTopic, { where: { meetingId } });
      if (current.length !== input.length || current.some((item) => !ids.includes(item.id))) {
        throw codedHttpException(HttpStatus.CONFLICT, 'AGENDA_CHANGED', 'Agenda changed; reload before reordering');
      }
      const sectionIds = [...new Set(input.map((item) => item.sectionId))];
      const availableSections = await manager.find(AgendaSection, { where: { id: In(sectionIds) } });
      if (availableSections.length !== sectionIds.length) throw codedHttpException(HttpStatus.BAD_REQUEST, 'AGENDA_SECTION_INVALID', 'An agenda section does not exist');
      const bySection = new Map<string, number[]>();
      for (const item of input) bySection.set(item.sectionId, [...(bySection.get(item.sectionId) ?? []), item.position]);
      for (const positions of bySection.values()) {
        const sorted = [...positions].sort((a, b) => a - b);
        if (sorted.some((position, index) => position !== index + 1)) {
          throw codedHttpException(HttpStatus.BAD_REQUEST, 'AGENDA_POSITIONS_INVALID', 'Positions must be consecutive and start at 1 in every section');
        }
      }
      const requested = new Map(input.map((item) => [item.id, item]));
      const ordered = current.map((item) => Object.assign(item, requested.get(item.id)!));
      await manager.save(MeetingTopic, ordered);
      return ordered.sort((left, right) => left.sectionId.localeCompare(right.sectionId) || left.position - right.position);
    });
  }

  async updateTopic(meetingId: string, id: string, input: UpdateMeetingTopicDto): Promise<MeetingTopic> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const item = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!item) throw codedHttpException(HttpStatus.NOT_FOUND, 'AGENDA_TOPIC_NOT_FOUND', 'Agenda topic not found');
      return manager.save(MeetingTopic, Object.assign(item, input));
    });
  }

  async updateTopicNote(meetingId: string, id: string, agendaNote: string | null): Promise<MeetingTopic> {
    return this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      const appearance = await manager.findOneBy(MeetingTopic, { id, meetingId });
      if (!appearance) {
        throw codedHttpException(
          HttpStatus.NOT_FOUND,
          'AGENDA_TOPIC_NOT_FOUND',
          'Agenda topic not found',
        );
      }
      appearance.agendaNote = agendaNote;
      return manager.save(MeetingTopic, appearance);
    });
  }

  async removeTopic(meetingId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockedMutableMeeting(manager, meetingId);
      await manager.delete(MeetingTopic, { id, meetingId });
    });
  }

  async suggestions(meetingId: string): Promise<Topic[]> {
    const meeting = await this.meetings.findOneBy({ id: meetingId });
    if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, 'MEETING_NOT_FOUND', 'Meeting not found');
    const existing = await this.meetingTopics.find({ where: { meetingId } });
    const excluded = existing.map((item) => item.topicId);
    const candidates = await this.topics.find({
      where: [
        { status: 'open' },
        { status: 'deferred', followUpDate: LessThanOrEqual(meeting.date) },
      ],
      relations: { responsibleUser: true, defaultSection: true },
      order: { followUpDate: 'ASC', updatedAt: 'DESC' },
    });
    return candidates.filter((topic) => !excluded.includes(topic.id));
  }

}
