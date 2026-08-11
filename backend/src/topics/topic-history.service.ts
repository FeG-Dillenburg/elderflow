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
  TopicHistoryTopicDisplay,
} from './topic-history';
import { TopicUpdate } from './topic-update.entity';
import { isE2eeKeyOperator } from '../e2ee/e2ee-role-policy';

type TimedHistoryEntry = TopicHistoryEntry & { sortTime: number };

@Injectable()
export class TopicHistoryService {
  constructor(
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicUpdate) private readonly updates: Repository<TopicUpdate>,
    @InjectRepository(MeetingTopic) private readonly appearances: Repository<MeetingTopic>,
    @InjectRepository(SkippedRecurrence) private readonly skippedRecurrences: Repository<SkippedRecurrence>,
  ) {}

  async getHistory(topicId: string, viewer: User): Promise<TopicHistoryEntry[]> {
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
        relations: { createdBy: true },
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

    const entries: TimedHistoryEntry[] = updates.map((update) =>
      this.standaloneUpdate(update, viewer));

    for (const appearance of appearances) {
      if (!appearance.meeting) continue;
      entries.push(this.meetingAppearance(topic, appearance, viewer));
    }

    for (const skip of skippedRecurrences) {
      if (skip.meeting) entries.push(this.skippedRecurrence(skip, viewer));
    }

    return entries
      .sort((left, right) => right.sortTime - left.sortTime || left.id.localeCompare(right.id))
      .map(({ sortTime: _sortTime, ...entry }) => entry);
  }

  private standaloneUpdate(update: TopicUpdate, viewer: User): StandaloneUpdateHistoryEntry & { sortTime: number } {
    return {
      id: `standalone-update:${update.id}`,
      kind: 'standalone_update',
      effectiveAt: update.date.toISOString(),
      sortTime: update.date.getTime(),
      updateId: update.id,
      createdByDisplayName: this.userDisplayName(update.createdBy),
      protected: isE2eeKeyOperator(viewer.role) && Buffer.isBuffer(update.textEnvelope)
        ? {
            textEnvelope: update.textEnvelope.toString('base64url'),
            textCommitRevision: update.textCommitRevision!,
          }
        : null,
    };
  }

  private meetingAppearance(
    topic: Topic,
    appearance: MeetingTopic,
    viewer: User,
  ): MeetingAppearanceHistoryEntry & { sortTime: number } {
    const meeting = this.meeting(appearance.meeting!, viewer);

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
      topic: this.topicDisplay(topic, viewer, appearance),
      meetingDocument: { meetingId: meeting.id, appearanceId: appearance.id },
    };
  }

  private skippedRecurrence(
    skip: SkippedRecurrence,
    viewer: User,
  ): SkippedRecurrenceHistoryEntry & { sortTime: number } {
    const meeting = this.meeting(skip.meeting!, viewer);
    return {
      id: `skipped-recurrence:${skip.id}`,
      kind: 'skipped_recurrence',
      effectiveAt: this.meetingEffectiveAt(meeting),
      sortTime: this.meetingSortTime(meeting),
      skippedRecurrenceId: skip.id,
      meeting,
    };
  }

  private topicDisplay(
    topic: Topic,
    viewer: User,
    appearance?: MeetingTopic,
    completedFallback = false,
  ): TopicHistoryTopicDisplay {
    const completed = appearance?.meeting?.status === 'completed' || completedFallback;
    const nameEnvelope = completed ? appearance?.topicNameSnapshotEnvelope : topic.nameEnvelope;
    const nameCommitRevision = completed
      ? appearance?.topicNameSnapshotCommitRevision
      : topic.nameCommitRevision;
    const membershipProcessStatusEnvelope = completed
      ? appearance?.membershipProcessStatusSnapshotEnvelope
      : topic.membershipProcessStatusEnvelope;
    const membershipProcessStatusCommitRevision = completed
      ? appearance?.membershipProcessStatusSnapshotCommitRevision
      : topic.membershipProcessStatusCommitRevision;
    const godparentsEnvelope = completed ? appearance?.godparentsSnapshotEnvelope : topic.godparentsEnvelope;
    const godparentsCommitRevision = completed
      ? appearance?.godparentsSnapshotCommitRevision
      : topic.godparentsCommitRevision;
    const canReadProtected = isE2eeKeyOperator(viewer.role)
      && Buffer.isBuffer(nameEnvelope)
      && Buffer.isBuffer(membershipProcessStatusEnvelope)
      && Buffer.isBuffer(godparentsEnvelope)
      && Boolean(nameCommitRevision)
      && Boolean(membershipProcessStatusCommitRevision)
      && Boolean(godparentsCommitRevision);
    return {
      id: topic.id,
      type: topic.type,
      responsibleUserDisplayName: completed
        ? appearance?.responsibleUserDisplayNameSnapshot ?? null
        : this.userDisplayName(topic.responsibleUser),
      membershipStatusSignal: topic.type === 'new_membership'
        ? completed
          ? (appearance?.membershipStatusSignalSnapshot as Topic['membershipStatusSignal']) ?? null
          : topic.membershipStatusSignal
        : null,
      protected: canReadProtected
        ? {
            nameEnvelope: nameEnvelope.toString('base64url'),
            nameCommitRevision: nameCommitRevision!,
            membershipProcessStatusEnvelope: membershipProcessStatusEnvelope.toString('base64url'),
            membershipProcessStatusCommitRevision: membershipProcessStatusCommitRevision!,
            godparentsEnvelope: godparentsEnvelope.toString('base64url'),
            godparentsCommitRevision: godparentsCommitRevision!,
          }
        : null,
      protectedUnavailable: !canReadProtected,
    };
  }

  private meeting(
    meeting: NonNullable<MeetingTopic['meeting']>,
    viewer: User,
  ): TopicHistoryMeeting {
    return {
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
