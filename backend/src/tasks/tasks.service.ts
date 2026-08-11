import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsSelect,
  FindOptionsWhere,
  In,
  LessThan,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { E2eeScalarService } from '../e2ee/e2ee-scalar.service';
import { SCALAR_AGGREGATES, TASK_SCALAR_FIELDS } from '../e2ee/scalar-registry';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { Meeting } from '../meetings/meeting.entity';
import { Topic } from '../topics/topic.entity';
import { topicLabelResponse } from '../topics/topic-response';
import { TaskDto, TaskUpdateDto } from './dto/task.dto';
import { Task } from './task.entity';
import { TaskResponse, taskMeetingReference, taskResponse } from './task-response';

const taskDetailSelect: FindOptionsSelect<Task> = {
  id: true,
  titleEnvelope: true,
  titleCommitRevision: true,
  descriptionEnvelope: true,
  descriptionCommitRevision: true,
  topicId: true,
  topic: { id: true, nameEnvelope: true, nameCommitRevision: true },
  meetingId: true,
  meeting: { id: true, date: true, beginTime: true, status: true },
  assignedToId: true,
  assignedTo: {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    language: true,
  },
  dueDate: true,
  status: true,
  createdAt: true,
  completedAt: true,
};

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly scalars: E2eeScalarService,
  ) {}

  async findAll(filters: {
    status?: string;
    assignedToId?: string;
    topicId?: string;
    meetingId?: string;
    overdue?: boolean;
    dueOn?: string;
  }, user: User): Promise<TaskResponse[]> {
    const where: FindOptionsWhere<Task> = {};
    where.status = filters.status === 'open' || !filters.status
      ? In(['open', 'in_progress'])
      : filters.status;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.topicId) where.topicId = filters.topicId;
    if (filters.meetingId) where.meetingId = filters.meetingId;
    if (filters.overdue) where.dueDate = LessThan(new Date().toISOString().slice(0, 10));
    else if (filters.dueOn) where.dueDate = LessThanOrEqual(filters.dueOn);
    const tasks = await this.tasks.find({
      where,
      relations: { topic: true, meeting: true, assignedTo: true },
      select: taskDetailSelect,
      order: { dueDate: 'ASC', createdAt: 'DESC' },
    });
    return tasks.map((task) => taskResponse(task, user));
  }

  async references(user: User) {
    const [topics, meetings] = await Promise.all([
      this.tasks.manager.getRepository(Topic).find({
        where: { status: In(['open', 'deferred']) },
        select: { id: true, nameEnvelope: true, nameCommitRevision: true },
        order: { updatedAt: 'DESC' },
      }),
      this.tasks.manager.getRepository(Meeting).find({
        select: { id: true, date: true, beginTime: true, status: true },
        order: { date: 'DESC' },
      }),
    ]);
    return {
      topics: topics.map((topic) => topicLabelResponse(topic, user)),
      meetings: meetings.map(taskMeetingReference),
    };
  }

  async create(input: TaskDto, user: User): Promise<TaskResponse> {
    this.scalars.assertContentUser(user);
    return this.tasks.manager.transaction(async (manager) => {
      const tasks = manager.getRepository(Task);
      const existing = await tasks.findOne({
        where: { id: input.id },
        relations: { topic: true, meeting: true, assignedTo: true },
        select: taskDetailSelect,
      });
      const encrypted = await this.validateTaskScalars(
        manager,
        user,
        input.id,
        input.protected,
        existing,
      );
      if (existing) {
        if (Object.keys(encrypted).length || !this.sameCreateStructure(existing, input)) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            'TASK_CREATE_RETRY_MISMATCH',
            'Task create identifier was retried with different content',
          );
        }
        return taskResponse(existing, user);
      }
      const { protected: _protected, ...structural } = input;
      const task = await tasks.save(tasks.create({ ...structural, ...encrypted }));
      return taskResponse(task, user);
    });
  }

  async update(id: string, input: TaskUpdateDto, user: User): Promise<TaskResponse> {
    this.scalars.assertContentUser(user);
    return this.tasks.manager.transaction(async (manager) => {
      const tasks = manager.getRepository(Task);
      const task = await tasks.findOne({
        where: { id },
        relations: { topic: true, meeting: true, assignedTo: true },
        select: taskDetailSelect,
        lock: { mode: 'pessimistic_write', tables: ['tasks'] },
      });
      if (!task) {
        throw codedHttpException(HttpStatus.NOT_FOUND, 'TASK_NOT_FOUND', 'Task not found');
      }
      const encrypted = input.protected
        ? await this.validateTaskScalars(manager, user, id, input.protected, task)
        : {};
      const { protected: _protected, ...structural } = input;
      Object.assign(task, structural, encrypted);
      if (input.status !== undefined) {
        task.completedAt = input.status === 'done' ? task.completedAt ?? new Date() : null;
      }
      return taskResponse(await tasks.save(task), user);
    });
  }

  private async validateTaskScalars(
    manager: Parameters<E2eeScalarService['validateWrite']>[0],
    user: User,
    recordId: string,
    input: Partial<TaskDto['protected']>,
    current: Task | null,
  ): Promise<Partial<Task>> {
    const result: Partial<Task> = {};
    for (const { envelopeProperty, revisionProperty, fieldId } of Object.values(TASK_SCALAR_FIELDS)) {
      const encoded = input[envelopeProperty];
      if (!encoded) continue;
      const write = await this.scalars.validateWrite(
        manager,
        user,
        { aggregateType: SCALAR_AGGREGATES.task, recordId, fieldId },
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

  private sameCreateStructure(task: Task, input: TaskDto): boolean {
    const fields: Array<'topicId' | 'meetingId' | 'assignedToId' | 'dueDate'> = [
      'topicId',
      'meetingId',
      'assignedToId',
      'dueDate',
    ];
    return fields
      .every((field) => (task[field] ?? null) === (input[field] ?? null))
      && task.status === input.status;
  }
}
