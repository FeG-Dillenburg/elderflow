import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { Meeting } from '../meetings/meeting.entity';
import { RecurrenceUnit, Topic } from '../topics/topic.entity';
import { SkippedRecurrence } from './skipped-recurrence.entity';

type RecurrenceConfiguration = Pick<Topic, 'recurrenceFirstDueDate' | 'recurrenceInterval' | 'recurrenceUnit'>;

export interface RecurrenceReconciliationPlan {
  moves: Array<{
    meetingId: string;
    sectionId: string;
    position: number;
    sourceAppearance: { id: string; meetingId: string } | null;
  }>;
  removals: Array<{ id: string; meetingId: string }>;
}

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

  async validate(manager: EntityManager, topic: Topic): Promise<void> {
    await this.buildPlan(manager, topic);
  }

  async plan(manager: EntityManager, topicId: string): Promise<RecurrenceReconciliationPlan> {
    const topic = await manager.findOne(Topic, { where: { id: topicId } });
    if (!topic) throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    if (topic.type !== 'recurring') {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'RECURRENCE_CONFIGURATION_INVALID', 'Topic is not recurring');
    }
    return this.buildPlan(manager, topic);
  }

  private async buildPlan(
    manager: EntityManager,
    topic: Topic,
  ): Promise<RecurrenceReconciliationPlan> {
    const meetings = await manager.find(Meeting, { order: { date: 'ASC', beginTime: 'ASC', id: 'ASC' } });
    if (!meetings.length) return { moves: [], removals: [] };
    const meetingIds = meetings.map(({ id }) => id);
    const [appearances, skips] = await Promise.all([
      manager.find(MeetingTopic, {
        where: { topicId: topic.id, meetingId: In(meetingIds) },
        relations: { meeting: true },
      }),
      manager.find(SkippedRecurrence, { where: { topicId: topic.id, meetingId: In(meetingIds) } }),
    ]);
    const movable = appearances
      .filter((item) => item.source === 'recurrence'
        && item.contentEditedAt === null
        && item.meeting?.status === 'planned')
      .sort((left, right) => left.meeting!.date.localeCompare(right.meeting!.date));
    if (topic.status !== 'open') {
      return {
        moves: [],
        removals: movable.map(({ id, meetingId }) => ({ id, meetingId })),
      };
    }
    const fixedByMeeting = new Map(
      appearances.filter((item) => !movable.includes(item)).map((item) => [item.meetingId, item]),
    );
    const skippedMeetingIds = new Set(skips.map(({ meetingId }) => meetingId));
    const desired: Meeting[] = [];
    let nextDue = topic.recurrenceFirstDueDate!;
    for (const [index, meeting] of meetings.entries()) {
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
      const nextPreservedMeeting = meetings.slice(index + 1).find((later) => fixedByMeeting.has(later.id));
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
      desired.push(meeting);
      nextDue = dueAfterCurrentMeeting;
    }

    const sectionId = topic.defaultSectionId;
    if (desired.length && (!sectionId || !(await manager.exists(AgendaSection, { where: { id: sectionId } })))) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'RECURRENCE_CONFIGURATION_INVALID', 'Recurring Topic default section is invalid');
    }
    const targets = await Promise.all(desired.map(async (meeting) => {
      const exact = movable.find((item) => item.meetingId === meeting.id);
      const sectionItems = (await manager.find(MeetingTopic, {
        where: { meetingId: meeting.id, sectionId: sectionId! },
        order: { position: 'ASC' },
      })).filter((item) => item.id !== exact?.id);
      const position = Math.min(topic.defaultPosition ?? sectionItems.length + 1, sectionItems.length + 1);
      return {
        meeting,
        position,
        stable: exact?.sectionId === sectionId && exact.position === position,
      };
    }));
    const stableMeetingIds = new Set(
      targets.filter(({ stable }) => stable).map(({ meeting }) => meeting.id),
    );
    const reusable = movable.filter((item) => !stableMeetingIds.has(item.meetingId));
    const moves = [] as RecurrenceReconciliationPlan['moves'];
    for (const { meeting, position, stable } of targets) {
      if (stable) continue;
      const exactIndex = reusable.findIndex((item) => item.meetingId === meeting.id);
      const source = reusable.splice(exactIndex >= 0 ? exactIndex : 0, 1)[0] ?? null;
      moves.push({
        meetingId: meeting.id,
        sectionId: sectionId!,
        position,
        sourceAppearance: source
          ? { id: source.id, meetingId: source.meetingId }
          : null,
      });
    }
    return {
      moves,
      removals: reusable.map(({ id, meetingId }) => ({ id, meetingId })),
    };
  }
}
