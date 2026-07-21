import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { User } from '../users/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const TOPIC_TYPES = [
  'generic',
  'person',
  'new_membership',
  'recurring',
] as const;

export type TopicType = (typeof TOPIC_TYPES)[number];

export const MEMBERSHIP_STATUS_SIGNALS = [
  'new',
  'in_progress',
  'nearly_finished',
  'attention',
  'paused',
] as const;

export type MembershipStatusSignal = (typeof MEMBERSHIP_STATUS_SIGNALS)[number];

export const TOPIC_STATUSES = ['open', 'done', 'deferred', 'archived'] as const;

@Entity({ name: 'topics' })
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  type: TopicType;

  @Column({ type: 'text', default: 'open' })
  status: string;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: string | null;

  @Column({ name: 'responsible_user_id', type: 'uuid', nullable: true })
  responsibleUserId: string | null;

  @Column({ name: 'membership_process_status', type: 'text', nullable: true })
  membershipProcessStatus: string | null;

  @Column({ name: 'membership_status_signal', type: 'text', nullable: true })
  membershipStatusSignal: MembershipStatusSignal | null;

  @Column({ type: 'text', nullable: true })
  godparents: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser?: User | null;

  @Column({ name: 'is_recurring', type: 'boolean', default: false, select: false })
  isRecurring: boolean;

  @Column({ name: 'default_section_id', type: 'uuid', nullable: true })
  defaultSectionId: string | null;

  @ManyToOne(() => AgendaSection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_section_id' })
  defaultSection?: AgendaSection | null;

  @Column({ name: 'default_position', type: 'integer', nullable: true })
  defaultPosition: number | null;

  @Column({ name: 'recurrence_first_due_date', type: 'date', nullable: true })
  recurrenceFirstDueDate: string | null;

  @Column({ name: 'recurrence_interval', type: 'integer', nullable: true })
  recurrenceInterval: number | null;

  @Column({ name: 'recurrence_unit', type: 'text', nullable: true })
  recurrenceUnit: 'weeks' | 'months' | null;

  nextDueDate?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
