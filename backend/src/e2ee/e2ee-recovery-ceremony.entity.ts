import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type RecoveryCeremonyState = 'pending_second_operator' | 'ready_to_activate' | 'activated' | 'aborted';

@Entity({ name: 'e2ee_recovery_ceremonies' })
export class E2eeRecoveryCeremony {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'initiator_id', type: 'uuid' })
  initiatorId: string;

  @Column({ name: 'initiator_session_version', type: 'integer' })
  initiatorSessionVersion: number;

  @Column({ name: 'initiator_session_id', type: 'text' })
  initiatorSessionId: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId: string | null;

  @Column({ name: 'approver_session_version', type: 'integer', nullable: true })
  approverSessionVersion: number | null;

  @Column({ name: 'approver_session_id', type: 'text', nullable: true })
  approverSessionId: string | null;

  @Column({ name: 'initiator_confirmed_at', type: 'timestamptz', nullable: true })
  initiatorConfirmedAt: Date | null;

  @Column({ name: 'approver_confirmed_at', type: 'timestamptz', nullable: true })
  approverConfirmedAt: Date | null;

  @Column({ type: 'text' })
  state: RecoveryCeremonyState;

  @Column({ name: 'expected_generation', type: 'integer' })
  expectedGeneration: number;

  @Column({ name: 'candidate_fingerprint', type: 'bytea' })
  candidateFingerprint: Buffer;

  @Column({ name: 'candidate_shared_passphrase_slot', type: 'bytea' })
  candidateSharedPassphraseSlot: Buffer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'activated_generation', type: 'integer', nullable: true })
  activatedGeneration: number | null;
}
