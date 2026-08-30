import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const externalProviderTypes = ['oidc', 'churchtools'] as const;
export type ExternalProviderType = (typeof externalProviderTypes)[number];

@Entity({ name: 'external_auth_providers' })
export class ExternalAuthProvider {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) type: ExternalProviderType;
  @Column({ name: 'display_label', type: 'text' }) displayLabel: string;
  @Column({ name: 'issuer_url', type: 'text', nullable: true }) issuerUrl: string | null;
  @Column({ name: 'churchtools_url', type: 'text', nullable: true }) churchToolsUrl: string | null;
  @Column({ name: 'client_id', type: 'text', nullable: true }) clientId: string | null;
  @Column({ name: 'public_base_url', type: 'text', nullable: true }) publicBaseUrl: string | null;
  @Column({ name: 'client_secret_envelope', type: 'text', nullable: true, select: false }) clientSecretEnvelope: string | null;
  @Column({ name: 'tested_fingerprint', type: 'text', nullable: true }) testedFingerprint: string | null;
  @Column({ name: 'tested_at', type: 'timestamptz', nullable: true }) testedAt: Date | null;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ name: 'diagnostic_code', type: 'text', nullable: true }) diagnosticCode: string | null;
  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true }) removedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
