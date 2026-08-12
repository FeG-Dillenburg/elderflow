import { isE2eeKeyOperator } from '../e2ee/e2ee-role-policy';
import { User } from '../users/user.entity';
import { accountResponse, topicLabelResponse } from '../topics/topic-response';
import { Task } from './task.entity';

export const taskMeetingReference = (meeting: NonNullable<Task['meeting']>, viewer: User) => ({
  id: meeting.id,
  protected: isE2eeKeyOperator(viewer.role) && Buffer.isBuffer(meeting.titleEnvelope)
    ? {
        titleEnvelope: meeting.titleEnvelope.toString('base64url'),
        titleCommitRevision: meeting.titleCommitRevision,
      }
    : null,
  date: meeting.date,
  beginTime: meeting.beginTime,
  status: meeting.status,
});

export function taskResponse(task: Task, viewer: User) {
  const canReadProtected = isE2eeKeyOperator(viewer.role);
  return {
    id: task.id,
    topicId: task.topicId,
    topic: task.topic ? topicLabelResponse(task.topic, viewer) : null,
    meetingId: task.meetingId,
    meeting: task.meeting ? taskMeetingReference(task.meeting, viewer) : null,
    assignedToId: task.assignedToId,
    assignedTo: accountResponse(task.assignedTo),
    dueDate: task.dueDate,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    protected: canReadProtected
      && Buffer.isBuffer(task.titleEnvelope)
      && Buffer.isBuffer(task.descriptionEnvelope)
      ? {
          titleEnvelope: task.titleEnvelope.toString('base64url'),
          titleCommitRevision: task.titleCommitRevision,
          descriptionEnvelope: task.descriptionEnvelope.toString('base64url'),
          descriptionCommitRevision: task.descriptionCommitRevision,
        }
      : null,
  };
}

export type TaskResponse = ReturnType<typeof taskResponse>;

export function taskSummaryResponse(task: Task, viewer: User) {
  const canReadProtected = isE2eeKeyOperator(viewer.role)
    && Buffer.isBuffer(task.titleEnvelope);
  return {
    id: task.id,
    topicId: task.topicId,
    meetingId: task.meetingId,
    assignedToId: task.assignedToId,
    assignedTo: accountResponse(task.assignedTo),
    dueDate: task.dueDate,
    status: task.status,
    completedAt: task.completedAt,
    protected: canReadProtected
      ? {
          titleEnvelope: task.titleEnvelope.toString('base64url'),
          titleCommitRevision: task.titleCommitRevision,
        }
      : null,
  };
}

export type TaskSummaryResponse = ReturnType<typeof taskSummaryResponse>;
