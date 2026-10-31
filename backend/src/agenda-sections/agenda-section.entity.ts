import type { TopicType } from '../topics/topic.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'agenda_sections' })
export class AgendaSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'default_topic_type', type: 'text', nullable: true, unique: true })
  defaultTopicType: TopicType | null;
}
