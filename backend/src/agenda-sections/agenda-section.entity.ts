import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'agenda_sections' })
export class AgendaSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;
}
