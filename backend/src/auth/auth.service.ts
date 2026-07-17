import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { permissionsByRole, UserPermissions } from './permissions';
import { SessionService } from './session.service';
import { LoginDto, UpdateProfileDto } from './dto/auth.dto';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: User['role'];
  language: User['language'];
  permissions: UserPermissions;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sessions: SessionService,
  ) {}

  async login(input: LoginDto): Promise<{ token: string; user: AuthUser }> {
    const user = await this.users.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = :email', { email: input.email })
      .andWhere('user.archived_at IS NULL')
      .getOne();
    if (!user?.passwordHash || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { token: this.sessions.create(user.id), user: this.present(user) };
  }

  present(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      language: user.language,
      permissions: permissionsByRole[user.role],
    };
  }

  async updateProfile(user: User, input: UpdateProfileDto): Promise<AuthUser> {
    user.email = input.email;
    user.firstName = input.firstName;
    user.lastName = input.lastName;
    if (input.language !== undefined) user.language = input.language;
    if (input.password) user.passwordHash = await hash(input.password, 12);
    try {
      return this.present(await this.users.save(user));
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  findActiveUser(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id, archivedAt: IsNull() } });
  }
}
