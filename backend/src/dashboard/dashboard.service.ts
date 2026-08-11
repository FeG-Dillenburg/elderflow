import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsRelations, FindOptionsSelect, In, LessThan, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Meeting } from '../meetings/meeting.entity';
import { TaskSummaryResponse, taskSummaryResponse } from '../tasks/task-response';
import { Task } from '../tasks/task.entity';
import {
  assignedTaskSummaryRelations,
  assignedTaskSummarySelect,
} from '../tasks/task-projection';
import { Topic } from '../topics/topic.entity';
import { accountResponse, topicLabelResponse } from '../topics/topic-response';
import { User } from '../users/user.entity';

const dashboardTopicResponse = (topic: Topic, viewer: User) => ({
  ...topicLabelResponse(topic, viewer),
  status: topic.status,
  followUpDate: topic.followUpDate,
  responsibleUserId: topic.responsibleUserId,
  responsibleUser: accountResponse(topic.responsibleUser),
});

const nextMeetingResponse = (meeting: Meeting | null) => meeting
  ? {
      id: meeting.id,
      date: meeting.date,
      beginTime: meeting.beginTime,
      status: meeting.status,
      meetingLeaderId: meeting.meetingLeaderId,
      meetingLeader: accountResponse(meeting.meetingLeader),
    }
  : null;

const dashboardTopicRelations: FindOptionsRelations<Topic> = {
  responsibleUser: true,
};

const dashboardTopicSelect: FindOptionsSelect<Topic> = {
  id: true,
  nameEnvelope: true,
  nameCommitRevision: true,
  status: true,
  followUpDate: true,
  responsibleUserId: true,
  responsibleUser: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    language: true,
  },
};

export interface DashboardData {
  nextMeeting: ReturnType<typeof nextMeetingResponse>;
  myOpenTasks: TaskSummaryResponse[];
  overdueTasks: TaskSummaryResponse[];
  followUpTopics: Array<ReturnType<typeof dashboardTopicResponse>>;
  recentTopics: Array<ReturnType<typeof dashboardTopicResponse>>;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
  ) {}

  async get(user: User): Promise<DashboardData> {
    const today = new Date().toISOString().slice(0, 10);
    const [nextMeeting, myOpenTasks, overdueTasks, followUpTopics, recentTopics] = await Promise.all([
      this.meetings.findOne({
        where: { date: MoreThanOrEqual(today), status: 'planned' },
        relations: { meetingLeader: true },
        select: {
          id: true,
          date: true,
          beginTime: true,
          status: true,
          meetingLeaderId: true,
          meetingLeader: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            language: true,
          },
        },
        order: { date: 'ASC' },
      }),
      this.tasks.find({
        where: { assignedToId: user.id, status: In(['open', 'in_progress']) },
        select: {
          id: true,
          titleEnvelope: true,
          titleCommitRevision: true,
          topicId: true,
          meetingId: true,
          assignedToId: true,
          dueDate: true,
          status: true,
          completedAt: true,
        },
        order: { dueDate: 'ASC' },
        take: 8,
      }),
      this.tasks.find({
        where: { dueDate: LessThan(today), status: In(['open', 'in_progress']) },
        relations: assignedTaskSummaryRelations,
        select: assignedTaskSummarySelect,
        order: { dueDate: 'ASC' },
        take: 8,
      }),
      this.topics.find({
        where: { followUpDate: LessThanOrEqual(today), status: In(['open', 'deferred']) },
        relations: dashboardTopicRelations,
        select: dashboardTopicSelect,
        order: { followUpDate: 'ASC' },
        take: 8,
      }),
      this.topics.find({
        where: { status: In(['open', 'deferred']) },
        relations: dashboardTopicRelations,
        select: dashboardTopicSelect,
        order: { updatedAt: 'DESC' },
        take: 8,
      }),
    ]);
    return {
      nextMeeting: nextMeetingResponse(nextMeeting),
      myOpenTasks: myOpenTasks.map((task) => taskSummaryResponse(task, user)),
      overdueTasks: overdueTasks.map((task) => taskSummaryResponse(task, user)),
      followUpTopics: followUpTopics.map((topic) => dashboardTopicResponse(topic, user)),
      recentTopics: recentTopics.map((topic) => dashboardTopicResponse(topic, user)),
    };
  }
}
