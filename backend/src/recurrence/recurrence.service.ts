import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { Meeting } from '../meetings/meeting.entity';
import { RecurrenceUnit, Topic } from '../topics/topic.entity';
import { SkippedRecurrence } from './skipped-recurrence.entity';

type RecurrenceConfiguration = Pick<Topic, 'recurrenceFirstDueDate' | 'recurrenceInterval' | 'recurrenceUnit'>;

@Injectable()
export class RecurrenceService {
  addInterval(date: string, interval: number, unit: RecurrenceUnit): string {
    const [year, month, day] = date.split('-').map(Number);
    if (unit === 'weeks') {
      const value = new Date(Date.UTC(year, month - 1, day + interval * 7));
      return value.toISOString().slice(0, 10);
    }
    const targetMonth = month - 1 + interval;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const finalDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, finalDay))).toISOString().slice(0, 10);
  }

  nextDueDate(configuration: RecurrenceConfiguration, appearanceDates: string[]): string {
    if (!configuration.recurrenceFirstDueDate || !configuration.recurrenceInterval || !configuration.recurrenceUnit) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'RECURRENCE_CONFIGURATION_INVALID', 'Recurring Topic configuration is incomplete');
    }
    const orderedDates = [...appearanceDates].sort();
    const latest = orderedDates[orderedDates.length - 1];
    return latest
      ? this.addInterval(latest, configuration.recurrenceInterval, configuration.recurrenceUnit)
      : configuration.recurrenceFirstDueDate;
  }

  async reconcile(manager: EntityManager): Promise<void> {
    const topics = await manager.find(Topic, {
      where: { type: 'recurring' },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const meetings = await manager.find(Meeting, { order: { date: 'ASC', beginTime: 'ASC', id: 'ASC' } });
    if (!topics.length || !meetings.length) return;

    const meetingIds = meetings.map(({ id }) => id);
    for (const topic of topics) {
      const appearances = await manager.find(MeetingTopic, {
        where: { topicId: topic.id, meetingId: In(meetingIds) },
        relations: { meeting: true },
      });
      const skips = await manager.find(SkippedRecurrence, { where: { topicId: topic.id, meetingId: In(meetingIds) } });
      const skippedMeetingIds = new Set(skips.map(({ meetingId }) => meetingId));
      const movable = appearances.filter((item) =>
        item.source === 'recurrence' && item.noteEditedAt === null && item.meeting?.status === 'planned');
      const reusableNotes = movable
        .sort((left, right) => left.meeting!.date.localeCompare(right.meeting!.date))
        .map((item) => item.agendaNote);
      if (movable.length) await manager.remove(MeetingTopic, movable);
      if (topic.status !== 'open') continue;
      const fixedByMeeting = new Map(
        appearances.filter((item) => !movable.includes(item)).map((item) => [item.meetingId, item]),
      );
      let nextDue = topic.recurrenceFirstDueDate!;
      for (const meeting of meetings) {
        const fixed = fixedByMeeting.get(meeting.id);
        if (fixed) {
          if (fixed.source === 'recurrence' && meeting.status === 'planned' && meeting.date < nextDue) {
            throw codedHttpException(
              HttpStatus.CONFLICT,
              'RECURRENCE_EDITED_APPEARANCE_CONFLICT',
              'A preserved Recurring Topic appearance conflicts with the calculated schedule',
            );
          }
          nextDue = this.addInterval(meeting.date, topic.recurrenceInterval!, topic.recurrenceUnit!);
          continue;
        }
        if (meeting.status !== 'planned' || meeting.date < nextDue || skippedMeetingIds.has(meeting.id)) continue;
        const nextPreservedMeeting = meetings.slice(meetings.indexOf(meeting) + 1)
          .find((laterMeeting) => fixedByMeeting.has(laterMeeting.id));
        const dueAfterCurrentMeeting = this.addInterval(
          meeting.date,
          topic.recurrenceInterval!,
          topic.recurrenceUnit!,
        );
        if (nextPreservedMeeting && nextPreservedMeeting.date < dueAfterCurrentMeeting) {
          throw codedHttpException(
            HttpStatus.CONFLICT,
            'RECURRENCE_EDITED_APPEARANCE_CONFLICT',
            'A preserved Recurring Topic appearance conflicts with the calculated schedule',
          );
        }
        const sectionId = topic.defaultSectionId;
        if (!sectionId || !(await manager.exists(AgendaSection, { where: { id: sectionId } }))) {
          throw codedHttpException(HttpStatus.BAD_REQUEST, 'RECURRENCE_CONFIGURATION_INVALID', 'Recurring Topic default section is invalid');
        }
        const sectionItems = await manager.find(MeetingTopic, {
          where: { meetingId: meeting.id, sectionId }, order: { position: 'ASC' },
        });
        const position = Math.min(topic.defaultPosition ?? sectionItems.length + 1, sectionItems.length + 1);
        const shifted = sectionItems.filter((item) => item.position >= position);
        for (const item of shifted) item.position += 1;
        if (shifted.length) await manager.save(MeetingTopic, shifted);
        await manager.save(MeetingTopic, manager.create(MeetingTopic, {
          meetingId: meeting.id,
          topicId: topic.id,
          sectionId,
          position,
          status: 'planned',
          source: 'recurrence',
          agendaNote: reusableNotes.shift() ?? topic.description ?? '',
          noteEditedAt: null,
        }));
        nextDue = this.addInterval(meeting.date, topic.recurrenceInterval!, topic.recurrenceUnit!);
      }
    }
  }
}
