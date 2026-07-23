import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { Topic } from '../topics/topic.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Meeting } from './meeting.entity';

export type AgendaAppearanceSource = 'manual' | 'recurrence';

export interface VersionedMeetingText {
  id: string | null;
  text: string | null;
  version: number;
}

@Entity({ name: 'meeting_topics' })
@Unique(['meetingId', 'topicId'])
export class MeetingTopic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id', type: 'uuid' })
  meetingId: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: Meeting;

  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic?: Topic;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => AgendaSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'section_id' })
  section?: AgendaSection;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'agenda_note', type: 'text', nullable: true })
  agendaNote: string | null;

  @Column({ type: 'text', default: 'manual' })
  source: AgendaAppearanceSource;

  @Column({ name: 'note_edited_at', type: 'timestamptz', nullable: true })
  noteEditedAt: Date | null;

  @Column({ name: 'note_version', type: 'integer', default: 0 })
  noteVersion: number;

  @Column({ name: 'planned_duration', type: 'integer', nullable: true })
  plannedDuration: number | null;

  @Column({ type: 'text', default: 'planned' })
  status: string;

  @Column({ name: 'deferred_at', type: 'timestamptz', nullable: true })
  deferredAt: Date | null;

  @Column({ name: 'topic_name_snapshot', type: 'text', nullable: true })
  topicNameSnapshot: string | null;

  @Column({ name: 'responsible_user_display_name_snapshot', type: 'text', nullable: true })
  responsibleUserDisplayNameSnapshot: string | null;

  @Column({ name: 'membership_process_status_snapshot', type: 'text', nullable: true })
  membershipProcessStatusSnapshot: string | null;

  @Column({ name: 'membership_status_signal_snapshot', type: 'text', nullable: true })
  membershipStatusSignalSnapshot: string | null;

  @Column({ name: 'godparents_snapshot', type: 'text', nullable: true })
  godparentsSnapshot: string | null;

  preparationContext?: VersionedMeetingText | null;

  personNote?: VersionedMeetingText | null;

  meetingMinutes?: VersionedMeetingText | null;
}
