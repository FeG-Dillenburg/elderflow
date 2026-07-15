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
  'recurring_agenda',
  'person_related',
  'prayer_pastoral_care',
  'urgent',
  'strategic',
  'communication',
  'appointment_date',
  'book_chapter_input',
  'general',
] as const;

export const TOPIC_STATUSES = ['open', 'done', 'deferred', 'archived'] as const;

@Entity({ name: 'topics' })
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text', default: 'open' })
  status: string;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: string | null;

  @Column({ name: 'responsible_user_id', type: 'uuid', nullable: true })
  responsibleUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser?: User | null;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ name: 'default_section_id', type: 'uuid', nullable: true })
  defaultSectionId: string | null;

  @ManyToOne(() => AgendaSection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_section_id' })
  defaultSection?: AgendaSection | null;

  @Column({ name: 'default_position', type: 'integer', nullable: true })
  defaultPosition: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
