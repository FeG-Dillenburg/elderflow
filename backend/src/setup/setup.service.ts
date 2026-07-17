import { ConflictException, Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateInitialUserDto } from './dto/setup.dto';

export const SETUP_PASSWORD = Symbol('SETUP_PASSWORD');

@Injectable()
export class SetupService implements OnModuleInit {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(SETUP_PASSWORD)
    private readonly setupPassword: string,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Initial setup password: ${this.setupPassword}`);
  }

  async status(): Promise<{ setupRequired: boolean }> {
    const users = await this.dataSource.getRepository(User).count();
    return { setupRequired: users === 0 };
  }

  async verifyPassword(candidate: string): Promise<{ valid: true }> {
    await this.ensureSetupRequired();
    if (!this.passwordMatches(candidate)) {
      throw new UnauthorizedException('Invalid setup password');
    }
    return { valid: true };
  }

  async createInitialUser(input: CreateInitialUserDto): Promise<User> {
    if (!this.passwordMatches(input.setupPassword)) {
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

  private passwordMatches(candidate: string): boolean {
    const expectedHash = createHash('sha256').update(this.setupPassword).digest();
    const candidateHash = createHash('sha256').update(candidate).digest();
    return timingSafeEqual(expectedHash, candidateHash);
  }
}
