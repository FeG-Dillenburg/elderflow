import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'e2ee_key_state' })
export class E2eeKeyState {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id: number;

  @Column({ name: 'organization_id', type: 'uuid', unique: true })
  organizationId: string;

  @Column({ type: 'integer', default: 1 })
  generation: number;

  @Column({ name: 'ork_id', type: 'uuid' })
  orkId: string;

  @Column({ name: 'ock_id', type: 'uuid' })
  ockId: string;

  @Column({ name: 'ock_epoch', type: 'integer' })
  ockEpoch: number;

  @Column({ name: 'shared_passphrase_slot', type: 'bytea' })
  sharedPassphraseSlot: Buffer;

  @Column({ name: 'recovery_slot', type: 'bytea' })
  recoverySlot: Buffer;

  @Column({ name: 'content_key_wrapper', type: 'bytea' })
  contentKeyWrapper: Buffer;

  @Column({ name: 'custody_acknowledged_by', type: 'uuid' })
  custodyAcknowledgedBy: string;

  @Column({ name: 'custody_acknowledged_at', type: 'timestamptz' })
  custodyAcknowledgedAt: Date;
}
