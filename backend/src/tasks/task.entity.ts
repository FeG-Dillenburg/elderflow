import { Meeting } from '../meetings/meeting.entity';
import { Topic } from '../topics/topic.entity';
import { User } from '../users/user.entity';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'topic_id', type: 'uuid', nullable: true })
  topicId: string | null;

  @ManyToOne(() => Topic, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'topic_id' })
  topic?: Topic | null;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meetingId: string | null;

  @ManyToOne(() => Meeting, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: Meeting | null;

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo?: User | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', default: 'open' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
