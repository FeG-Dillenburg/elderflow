import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ExternalLoginPurpose = 'login' | 'test';

@Entity({ name: 'external_login_transactions' })
export class ExternalLoginTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId: string;
  @Column({ type: 'text' }) purpose: ExternalLoginPurpose;
  @Column({ name: 'state_hash', type: 'text' }) stateHash: string;
  @Column({ name: 'code_verifier', type: 'text' }) codeVerifier: string;
  @Column({ type: 'text', nullable: true }) nonce: string | null;
  @Column({ name: 'return_path', type: 'text', default: '/' }) returnPath: string;
  @Column({ name: 'configuration_fingerprint', type: 'text' }) configurationFingerprint: string;
  @Column({ name: 'completion_code_hash', type: 'text', nullable: true }) completionCodeHash: string | null;
  @Column({ name: 'completed_user_id', type: 'uuid', nullable: true }) completedUserId: string | null;
  @Column({ name: 'result_code', type: 'text', nullable: true }) resultCode: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'callback_consumed_at', type: 'timestamptz', nullable: true }) callbackConsumedAt: Date | null;
  @Column({ name: 'completion_consumed_at', type: 'timestamptz', nullable: true }) completionConsumedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
