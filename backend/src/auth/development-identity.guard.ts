import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';
import { UserRole } from '../users/user.entity';

@Injectable()
export class DevelopmentIdentityGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const environment = this.config.get<string>('NODE_ENV');
    if (!['development', 'test'].includes(environment ?? '')) {
      throw new UnauthorizedException('OAuth2 authentication is not configured yet');
    }

    const email = this.config.get<string>('DEV_USER_EMAIL');
    if (!email) {
      throw new UnauthorizedException('DEV_USER_EMAIL must select a development user');
    }

    const user = await this.users.findOne({ where: { email: email.toLowerCase(), archivedAt: IsNull() } });
    if (!user) {
      throw new UnauthorizedException(`Development user ${email} does not exist`);
    }

    context.switchToHttp().getRequest<{ user: User }>().user = user;
    const request = context.switchToHttp().getRequest<{ method: string }>();
    if (user.role === 'viewer' && request.method !== 'GET') {
      throw new ForbiddenException('Viewer access is read-only');
    }
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('Your role does not allow this action');
    }
    return true;
  }
}
