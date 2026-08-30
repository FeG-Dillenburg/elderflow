import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ExternalAuthProvider } from './external-auth-provider.entity';

@Entity({ name: 'external_identities' })
export class ExternalIdentity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId: string;
  @ManyToOne(() => ExternalAuthProvider) @JoinColumn({ name: 'provider_id' }) provider: ExternalAuthProvider;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'user_id' }) user: User;
  @Column({ type: 'text' }) subject: string;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ name: 'linked_at', type: 'timestamptz' }) linkedAt: Date;
}
