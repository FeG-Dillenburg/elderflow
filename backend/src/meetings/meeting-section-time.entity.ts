import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AgendaSection } from '../agenda-sections/agenda-section.entity';
import { Meeting } from './meeting.entity';

@Entity({ name: 'meeting_section_times' })
@Unique('meeting_section_times_unique', ['meetingId', 'sectionId'])
@Check('minutes >= 0')
export class MeetingSectionTime {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id', type: 'uuid' })
  meetingId: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: Meeting;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => AgendaSection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'section_id' })
  section?: AgendaSection;

  @Column({ type: 'integer' })
  minutes: number;
}
