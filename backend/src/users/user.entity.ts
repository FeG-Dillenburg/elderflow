import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const userRoles = ['superadmin', 'it-admin', 'admin', 'user', 'guest'] as const;
export type UserRole = typeof userRoles[number];

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName: string;

  @Column({ type: 'text', default: 'user' })
  role: UserRole;

  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
