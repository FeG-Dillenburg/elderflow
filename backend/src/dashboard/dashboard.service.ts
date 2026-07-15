import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Meeting } from '../meetings/meeting.entity';
import { Task } from '../tasks/task.entity';
import { Topic } from '../topics/topic.entity';
import { User } from '../users/user.entity';

export interface DashboardData {
  nextMeeting: Meeting | null;
  myOpenTasks: Task[];
  overdueTasks: Task[];
  followUpTopics: Topic[];
  recentTopics: Topic[];
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
        relations: { meetingLeader: true, minuteTaker: true },
        order: { date: 'ASC' },
      }),
      this.tasks.find({
        where: { assignedToId: user.id, status: In(['open', 'in_progress']) },
        relations: { topic: true }, order: { dueDate: 'ASC' }, take: 8,
      }),
      this.tasks.find({
        where: { dueDate: LessThan(today), status: In(['open', 'in_progress']) },
        relations: { topic: true, assignedTo: true }, order: { dueDate: 'ASC' }, take: 8,
      }),
      this.topics.find({
        where: { followUpDate: LessThanOrEqual(today), status: In(['open', 'deferred']) },
        relations: { responsibleUser: true }, order: { followUpDate: 'ASC' }, take: 8,
      }),
      this.topics.find({
        where: { status: In(['open', 'deferred']) }, relations: { responsibleUser: true },
        order: { updatedAt: 'DESC' }, take: 8,
      }),
    ]);
    return { nextMeeting, myOpenTasks, overdueTasks, followUpTopics, recentTopics };
  }
}
