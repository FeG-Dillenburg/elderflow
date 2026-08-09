import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'e2ee_audit_events' })
export class E2eeAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType: string;

  @Column({ name: 'actor_ids', type: 'jsonb' })
  actorIds: string[];

  @Column({ name: 'key_generation', type: 'integer' })
  keyGeneration: number;

  @Column({ type: 'text' })
  outcome: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
