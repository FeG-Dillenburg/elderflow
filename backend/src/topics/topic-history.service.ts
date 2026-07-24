import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeetingTopic } from '../meetings/meeting-topic.entity';
import { SkippedRecurrence } from '../recurrence/skipped-recurrence.entity';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { Topic } from './topic.entity';
import {
  MeetingAppearanceHistoryEntry,
  SkippedRecurrenceHistoryEntry,
  StandaloneUpdateHistoryEntry,
  TopicHistoryEntry,
  TopicHistoryMeeting,
  TopicHistoryMinutesEntry,
  TopicHistoryTopicDisplay,
} from './topic-history';
import { TopicUpdate } from './topic-update.entity';

type TimedHistoryEntry = TopicHistoryEntry & { sortTime: number };

@Injectable()
export class TopicHistoryService {
  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(MeetingTopic) private readonly appearances: Repository<MeetingTopic>,
    @InjectRepository(SkippedRecurrence) private readonly skippedRecurrences: Repository<SkippedRecurrence>,
  ) {}

  async getHistory(topicId: string): Promise<TopicHistoryEntry[]> {
    const topic = await this.topics.findOne({
      where: { id: topicId },
      relations: { responsibleUser: true },
    });
    if (!topic) {
      throw codedHttpException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    }

    const [updates, appearances, skippedRecurrences] = await Promise.all([
      this.updates.find({
        where: { topicId },
        relations: { createdBy: true, meeting: { minuteTaker: true } },
      }),
      this.appearances.find({
        where: { topicId },
        relations: { meeting: { minuteTaker: true }, section: true },
      }),
      topic.type === 'recurring'
        ? this.skippedRecurrences.find({
          where: { topicId },
          relations: { meeting: { minuteTaker: true } },
        })
        : Promise.resolve([]),
    ]);

    const meetingUpdates = new Map<string, TopicUpdate[]>();
    const entries: TimedHistoryEntry[] = [];
    for (const update of updates) {
      if (update.meetingId) {
        const grouped = meetingUpdates.get(update.meetingId) ?? [];
        grouped.push(update);
        meetingUpdates.set(update.meetingId, grouped);
      } else {
        entries.push(this.standaloneUpdate(update));
      }
    }

    for (const appearance of appearances) {
      if (!appearance.meeting) continue;
      entries.push(this.meetingAppearance(
        topic,
        appearance,
        meetingUpdates.get(appearance.meetingId) ?? [],
      ));
      meetingUpdates.delete(appearance.meetingId);
    }

    for (const [meetingId, orphanedMinutes] of meetingUpdates) {
      const meeting = orphanedMinutes.find((update) => update.meeting)?.meeting;
      if (meeting) {
        entries.push(this.missingAppearance(topic, meetingId, meeting, orphanedMinutes));
      }
    }

    for (const skip of skippedRecurrences) {
      if (skip.meeting) entries.push(this.skippedRecurrence(skip));
    }

    return entries
      .sort((left, right) => right.sortTime - left.sortTime || left.id.localeCompare(right.id))
      .map(({ sortTime: _sortTime, ...entry }) => entry);
  }

  private standaloneUpdate(update: TopicUpdate): StandaloneUpdateHistoryEntry & { sortTime: number } {
    return {
      id: `standalone-update:${update.id}`,
      kind: 'standalone_update',
      effectiveAt: update.date.toISOString(),
      sortTime: update.date.getTime(),
      updateId: update.id,
      text: update.text,
      createdByDisplayName: this.userDisplayName(update.createdBy),
    };
  }

  private meetingAppearance(
    topic: Topic,
    appearance: MeetingTopic,
    updates: TopicUpdate[],
  ): MeetingAppearanceHistoryEntry & { sortTime: number } {
    const meeting = this.meeting(appearance.meeting!);
    const { meetingMinutes, legacyMinutesEntries } =
      this.classifiedMinutes(topic, updates);

    return {
      id: `meeting-appearance:${appearance.id}`,
      kind: 'meeting_appearance',
      effectiveAt: this.meetingEffectiveAt(meeting),
      sortTime: this.meetingSortTime(meeting),
      appearanceId: appearance.id,
      deferredAt: appearance.deferredAt?.toISOString() ?? null,
      meeting,
      section: appearance.section
        ? { id: appearance.section.id, name: appearance.section.name }
        : null,
      topic: this.topicDisplay(topic, appearance),
      preparationContext: topic.type === 'person' ? null : appearance.agendaNote,
      personNote: topic.type === 'person' ? appearance.agendaNote : null,
      meetingMinutes,
      legacyMinutesEntries,
    };
  }

  private skippedRecurrence(skip: SkippedRecurrence): SkippedRecurrenceHistoryEntry & { sortTime: number } {
    const meeting = this.meeting(skip.meeting!);
    return {
      id: `skipped-recurrence:${skip.id}`,
      kind: 'skipped_recurrence',
      effectiveAt: this.meetingEffectiveAt(meeting),
      sortTime: this.meetingSortTime(meeting),
      skippedRecurrenceId: skip.id,
      meeting,
    };
  }

  private missingAppearance(
    topic: Topic,
    meetingId: string,
    meetingEntity: NonNullable<TopicUpdate['meeting']>,
    updates: TopicUpdate[],
  ): MeetingAppearanceHistoryEntry & { sortTime: number } {
    const meeting = this.meeting(meetingEntity);
    const { meetingMinutes, legacyMinutesEntries } =
      this.classifiedMinutes(topic, updates);
    return {
      id: `meeting-appearance:missing:${meetingId}`,
      kind: 'meeting_appearance',
      effectiveAt: this.meetingEffectiveAt(meeting),
      sortTime: this.meetingSortTime(meeting),
      appearanceId: null,
      deferredAt: null,
      meeting,
      section: null,
      topic: this.topicDisplay(topic, undefined, meeting.status === 'completed'),
      preparationContext: null,
      personNote: null,
      meetingMinutes,
      legacyMinutesEntries,
    };
  }

  private topicDisplay(
    topic: Topic,
    appearance?: MeetingTopic,
    completedFallback = false,
  ): TopicHistoryTopicDisplay {
    const completed = appearance?.meeting?.status === 'completed' || completedFallback;
    return {
      type: topic.type,
      name: completed ? appearance?.topicNameSnapshot ?? null : topic.name,
      responsibleUserDisplayName: completed
        ? appearance?.responsibleUserDisplayNameSnapshot ?? null
        : this.userDisplayName(topic.responsibleUser),
      membershipProcessStatus: topic.type === 'new_membership'
        ? completed
          ? appearance?.membershipProcessStatusSnapshot ?? null
          : topic.membershipProcessStatus
        : null,
      membershipStatusSignal: topic.type === 'new_membership'
        ? completed
          ? (appearance?.membershipStatusSignalSnapshot as Topic['membershipStatusSignal']) ?? null
          : topic.membershipStatusSignal
        : null,
      godparents: topic.type === 'new_membership'
        ? completed
          ? appearance?.godparentsSnapshot ?? null
          : topic.godparents
        : null,
    };
  }

  private minutes(updates: TopicUpdate[]): TopicHistoryMinutesEntry[] {
    return updates.map((update): TopicHistoryMinutesEntry => ({
      id: update.id,
      effectiveAt: update.date.toISOString(),
      text: update.text,
      createdByDisplayName: this.userDisplayName(update.createdBy),
    })).sort((left, right) => left.effectiveAt.localeCompare(right.effectiveAt) || left.id.localeCompare(right.id));
  }

  private classifiedMinutes(
    topic: Topic,
    updates: TopicUpdate[],
  ): Pick<MeetingAppearanceHistoryEntry, 'meetingMinutes' | 'legacyMinutesEntries'> {
    const minutes = this.minutes(updates);
    return topic.type === 'person'
      ? {
        meetingMinutes: null,
        legacyMinutesEntries: minutes,
      }
      : {
        meetingMinutes: minutes[minutes.length - 1] ?? null,
        legacyMinutesEntries: minutes.slice(0, -1),
      };
  }

  private meeting(meeting: NonNullable<MeetingTopic['meeting']>): TopicHistoryMeeting {
    return {
      id: meeting.id,
      title: meeting.title,
      date: meeting.date,
      beginTime: meeting.beginTime,
      status: meeting.status,
      minuteTakerDisplayName: this.userDisplayName(meeting.minuteTaker),
    };
  }

  private meetingEffectiveAt(meeting: TopicHistoryMeeting): string {
    return `${meeting.date}T${meeting.beginTime}`;
  }

  private meetingSortTime(meeting: TopicHistoryMeeting): number {
    return new Date(this.meetingEffectiveAt(meeting)).getTime();
  }

  private userDisplayName(user?: User | null): string | null {
    return user ? `${user.firstName} ${user.lastName}` : null;
  }
}
