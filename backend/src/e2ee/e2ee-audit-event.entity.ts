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

  @Column({ type: 'text', nullable: true })
  operation: string | null;

  @Column({ name: 'reason_code', type: 'text', nullable: true })
  reasonCode: string | null;

  @Column({ name: 'ork_id', type: 'uuid', nullable: true })
  orkId: string | null;

  @Column({ name: 'ock_id', type: 'uuid', nullable: true })
  ockId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
