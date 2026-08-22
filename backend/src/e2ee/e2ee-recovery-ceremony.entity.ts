import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type RecoveryCeremonyState = 'pending_second_operator' | 'ready_to_activate' | 'activated' | 'aborted';
export type KeyCeremonyOperation =
  | 'lost_passphrase'
  | 'change_passphrase'
  | 'replace_recovery_secret'
  | 'rotate_root_key'
  | 'rotate_root_and_content_key';

@Entity({ name: 'e2ee_recovery_ceremonies' })
export class E2eeRecoveryCeremony {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', default: 'lost_passphrase' })
  operation: KeyCeremonyOperation;

  @Column({ name: 'reason_code', type: 'text', default: 'passphrase_lost' })
  reasonCode: string;

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

  @Column({ name: 'candidate_ork_id', type: 'uuid' })
  candidateOrkId: string;

  @Column({ name: 'candidate_ock_id', type: 'uuid' })
  candidateOckId: string;

  @Column({ name: 'candidate_ock_epoch', type: 'integer' })
  candidateOckEpoch: number;

  @Column({ name: 'candidate_recovery_slot', type: 'bytea' })
  candidateRecoverySlot: Buffer;

  @Column({ name: 'candidate_content_key_wrapper', type: 'bytea' })
  candidateContentKeyWrapper: Buffer;

  @Column({ name: 'candidate_historical_ock_ids', type: 'uuid', array: true, default: '{}' })
  candidateHistoricalOckIds: string[];

  @Column({ name: 'candidate_historical_ock_epochs', type: 'integer', array: true, default: '{}' })
  candidateHistoricalOckEpochs: number[];

  @Column({ name: 'candidate_historical_content_key_wrappers', type: 'bytea', array: true, default: '{}' })
  candidateHistoricalContentKeyWrappers: Buffer[];

  @Column({ name: 'custody_copies_acknowledged', type: 'integer', default: 0 })
  custodyCopiesAcknowledged: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'activated_generation', type: 'integer', nullable: true })
  activatedGeneration: number | null;
}
