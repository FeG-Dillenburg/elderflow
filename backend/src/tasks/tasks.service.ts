import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { TaskDto } from './dto/task.dto';
import { Task } from './task.entity';

@Injectable()
export class TasksService {
  constructor(@InjectRepository(Task) private readonly tasks: Repository<Task>) {}

  findAll(filters: {
    status?: string;
    assignedToId?: string;
    topicId?: string;
    meetingId?: string;
    overdue?: boolean;
    dueOn?: string;
  }): Promise<Task[]> {
    const where: FindOptionsWhere<Task> = {};
    where.status = filters.status === 'open' || !filters.status ? In(['open', 'in_progress']) : filters.status;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.topicId) where.topicId = filters.topicId;
    if (filters.meetingId) where.meetingId = filters.meetingId;
    if (filters.overdue) where.dueDate = LessThan(new Date().toISOString().slice(0, 10));
    else if (filters.dueOn) where.dueDate = LessThanOrEqual(filters.dueOn);
    return this.tasks.find({
      where,
      relations: { topic: true, meeting: true, assignedTo: true },
      order: { dueDate: 'ASC', createdAt: 'DESC' },
    });
  }

  create(input: TaskDto): Promise<Task> {
    return this.tasks.save(this.tasks.create(input));
  }

  async update(id: string, input: TaskDto): Promise<Task> {
    const task = await this.tasks.findOneBy({ id });
    if (!task) throw new NotFoundException('Task not found');
    Object.assign(task, input);
    task.completedAt = input.status === 'done' ? task.completedAt ?? new Date() : null;
    return this.tasks.save(task);
  }
}
