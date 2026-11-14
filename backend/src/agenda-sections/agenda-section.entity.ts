import type { TopicType } from '../topics/topic.entity';
import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'agenda_sections' })
@Check('default_minutes >= 0')
export class AgendaSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'default_minutes', type: 'integer', default: 0 })
  defaultMinutes: number;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'default_topic_type', type: 'text', nullable: true, unique: true })
  defaultTopicType: TopicType | null;
}
