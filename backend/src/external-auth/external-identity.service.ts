import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { ExternalIdentityResult } from './adapters/provider-adapter';
import { ExternalIdentity } from './external-identity.entity';
import { normalizeEmail } from './external-auth.utils';

@Injectable()
export class ExternalIdentityService {
  constructor(
    @InjectRepository(ExternalIdentity) private readonly identities: Repository<ExternalIdentity>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async authenticate(providerId: string, identity: ExternalIdentityResult): Promise<User> {
    const existing = await this.identities.findOne({
      where: { providerId, subject: identity.subject, active: true },
      relations: { user: true },
    });
    if (existing) {
      if (existing.user?.archivedAt) throw this.failure();
      return existing.user;
    }

    const matches = await this.users.createQueryBuilder('user')
      .where('LOWER(TRIM(user.email)) = :email', { email: normalizeEmail(identity.email) })
      .andWhere('user.archived_at IS NULL')
      .getMany();
    if (matches.length !== 1) throw this.failure();
    try {
      await this.identities.save(this.identities.create({
        providerId,
        userId: matches[0].id,
        subject: identity.subject,
        active: true,
        linkedAt: new Date(),
      }));
    } catch (error) {
      if (error instanceof QueryFailedError) throw this.failure();
      throw error;
    }
    return matches[0];
  }

  async reset(providerId: string, userId: string): Promise<void> {
    await this.identities.delete({ providerId, userId, active: true });
  }

  private failure() {
    return codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_EXTERNAL_LOGIN_FAILED', 'External login failed');
  }
}
