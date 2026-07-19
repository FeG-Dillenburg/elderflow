import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { codedHttpException } from '../errors/coded-http.exception';
import { Meeting } from './meeting.entity';

export const lockedMutableMeeting = async (manager: EntityManager, id: string): Promise<Meeting> => {
  const meeting = await manager.findOne(Meeting, {
    where: { id },
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
  return meeting;
};
