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

@Entity({ name: 'meetings' })
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'title_envelope', type: 'bytea' })
  titleEnvelope: Buffer;

  @Column({ name: 'title_commit_revision', type: 'bigint', default: 1 })
  titleCommitRevision: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'begin_time', type: 'time' })
  beginTime: string;

  @Column({ type: 'text', default: 'planned' })
  status: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'meeting_leader_id', type: 'uuid', nullable: true })
  meetingLeaderId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_leader_id' })
  meetingLeader?: User | null;

  @Column({ name: 'minute_taker_id', type: 'uuid', nullable: true })
  minuteTakerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'minute_taker_id' })
  minuteTaker?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
