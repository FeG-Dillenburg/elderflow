import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_CATEGORY_KEY, PermissionCategory, permissionsByRole } from './permissions';
import { SessionService } from './session.service';

@Injectable()
export class DevelopmentIdentityGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ method: string; headers: { authorization?: string }; user: User }>();
    const authorization = request.headers?.authorization;
    let user: User | null = null;
    if (authorization?.startsWith('Bearer ')) {
      const session = this.sessions.verify(authorization.slice(7));
      user = await this.users.findOne({ where: { id: session.sub, archivedAt: IsNull() } });
      if (!user) throw new UnauthorizedException('Session user does not exist');
    } else {
      const environment = this.config.get<string>('NODE_ENV');
      const developmentBypass = this.config.get<boolean>('DEV_AUTH_BYPASS');
      if (!['development', 'test'].includes(environment ?? '') || !developmentBypass) {
        throw new UnauthorizedException('Authentication is required');
      }

      const email = this.config.get<string>('DEV_USER_EMAIL');
      if (!email) throw new UnauthorizedException('Authentication is required');
      user = await this.users.findOne({ where: { email: email.toLowerCase(), archivedAt: IsNull() } });
      if (!user) throw new UnauthorizedException(`Development user ${email} does not exist`);
    }

    request.user = user;
    const category = this.reflector.getAllAndOverride<PermissionCategory>(PERMISSION_CATEGORY_KEY, [context.getHandler(), context.getClass()]);
    if (category) {
      const permission = permissionsByRole[user.role][category];
      if (permission === 'hide' || (permission === 'view' && !['GET', 'HEAD'].includes(request.method))) {
        throw new ForbiddenException('Your role does not allow this action');
      }
    }
    return true;
  }
}
