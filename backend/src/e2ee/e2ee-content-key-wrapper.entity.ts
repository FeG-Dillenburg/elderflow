import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'e2ee_content_key_wrappers' })
export class E2eeContentKeyWrapper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'ork_id', type: 'uuid' })
  orkId: string;

  @Column({ name: 'ock_id', type: 'uuid' })
  ockId: string;

  @Column({ name: 'ock_epoch', type: 'integer' })
  ockEpoch: number;

  @Column({ type: 'bytea' })
  wrapper: Buffer;

  @CreateDateColumn({ name: 'activated_at', type: 'timestamptz' })
  activatedAt: Date;

  @Column({ name: 'writable_until', type: 'timestamptz', nullable: true })
  writableUntil: Date | null;

  @Column({ name: 'retained_until', type: 'timestamptz', nullable: true })
  retainedUntil: Date | null;
}
