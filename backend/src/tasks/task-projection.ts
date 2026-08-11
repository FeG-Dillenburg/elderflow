import { FindOptionsRelations, FindOptionsSelect } from 'typeorm';
import { Task } from './task.entity';

export const assignedTaskSummaryRelations: FindOptionsRelations<Task> = {
  assignedTo: true,
};

export const assignedTaskSummarySelect: FindOptionsSelect<Task> = {
  id: true,
  titleEnvelope: true,
  titleCommitRevision: true,
  topicId: true,
  meetingId: true,
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
  completedAt: true,
};
