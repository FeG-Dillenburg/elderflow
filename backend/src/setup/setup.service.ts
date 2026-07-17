import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateInitialUserDto } from './dto/setup.dto';

export const SETUP_PASSWORD_HASH = Symbol('SETUP_PASSWORD_HASH');

@Injectable()
export class SetupService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SETUP_PASSWORD_HASH)
    private readonly setupPasswordHash: string,
  ) {}

  async status(): Promise<{ setupRequired: boolean }> {
    const users = await this.dataSource.getRepository(User).count();
    return { setupRequired: users === 0 };
  }

  async verifyPassword(candidate: string): Promise<{ valid: true }> {
    await this.ensureSetupRequired();
    if (!(await this.passwordMatches(candidate))) {
      throw new UnauthorizedException('Invalid setup password');
    }
    return { valid: true };
  }

  async createInitialUser(input: CreateInitialUserDto): Promise<User> {
    if (!(await this.passwordMatches(input.setupPassword))) {
      throw new UnauthorizedException('Invalid setup password');
    }

    const passwordHash = await hash(input.password, 12);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('elderflow-initial-setup'))");
      if (await manager.count(User)) {
        throw new ConflictException('System already setup');
      }

      const user = manager.create(User, {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        role: 'superadmin',
      });
      const saved = await manager.save(User, user);
      delete (saved as Partial<User>).passwordHash;
      return saved;
    });
  }

  private async ensureSetupRequired(): Promise<void> {
    if (!(await this.status()).setupRequired) {
      throw new ConflictException('System already setup');
    }
  }

  private passwordMatches(candidate: string): Promise<boolean> {
    return compare(candidate, this.setupPasswordHash);
  }
}
