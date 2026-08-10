import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_CATEGORY_KEY, PermissionCategory, permissionsByRole } from './permissions';
import { SessionService } from './session.service';
import { codedHttpException } from '../errors/coded-http.exception';
import { ALLOW_REVOKED_SESSION_KEY } from './allow-revoked-session.decorator';
import { CEREMONY_ALLOWED_KEY } from './ceremony-allowed.decorator';
import { E2eeRecoveryCeremony } from '../e2ee/e2ee-recovery-ceremony.entity';

@Injectable()
export class DevelopmentIdentityGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sessions: SessionService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ method: string; headers: { authorization?: string }; user: User; sessionId: string }>();
    const authorization = request.headers?.authorization;
    let user: User | null = null;
    if (authorization?.startsWith('Bearer ')) {
      const session = this.sessions.verify(authorization.slice(7));
      user = await this.users.findOne({ where: { id: session.sub, archivedAt: IsNull() } });
      if (!user) throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_USER_NOT_FOUND', 'Session user does not exist');
      if (user.sessionVersion !== session.ver) {
        const allowsRevokedSession = this.reflector.getAllAndOverride<boolean>(ALLOW_REVOKED_SESSION_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (!allowsRevokedSession) {
          throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_REVOKED', 'Session was revoked');
        }
      }
      request.sessionId = session.sid;
    } else {
      const environment = this.config.get<string>('NODE_ENV');
      const developmentBypass = this.config.get<boolean>('DEV_AUTH_BYPASS');
      if (!['development', 'test'].includes(environment ?? '') || !developmentBypass) {
        throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication is required');
      }

      const email = this.config.get<string>('DEV_USER_EMAIL');
      if (!email) throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication is required');
      user = await this.users.findOne({ where: { email: email.toLowerCase(), archivedAt: IsNull() } });
      if (!user) throw codedHttpException(HttpStatus.UNAUTHORIZED, 'AUTH_USER_NOT_FOUND', `Development user ${email} does not exist`);
      request.sessionId = `development:${user.id}`;
    }

    request.user = user;
    await this.assertCeremonyBoundary(context, request.sessionId);
    const category = this.reflector.getAllAndOverride<PermissionCategory>(PERMISSION_CATEGORY_KEY, [context.getHandler(), context.getClass()]);
    if (category) {
      const permission = permissionsByRole[user.role][category];
      if (permission === 'hide' || (permission === 'view' && !['GET', 'HEAD'].includes(request.method))) {
        throw codedHttpException(HttpStatus.FORBIDDEN, 'AUTH_FORBIDDEN', 'Your role does not allow this action');
      }
    }
    return true;
  }

  private async assertCeremonyBoundary(context: ExecutionContext, sessionId: string): Promise<void> {
    const active = await this.dataSource.getRepository(E2eeRecoveryCeremony).findOne({
      where: [
        { initiatorSessionId: sessionId, state: In(['pending_second_operator', 'ready_to_activate']), expiresAt: MoreThan(new Date()) },
        { approverSessionId: sessionId, state: In(['pending_second_operator', 'ready_to_activate']), expiresAt: MoreThan(new Date()) },
      ],
    });
    if (!active) return;
    const allowed = this.reflector.getAllAndOverride<boolean>(CEREMONY_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) {
      throw codedHttpException(HttpStatus.CONFLICT, 'E2EE_CEREMONY_SESSION_EXCLUSIVE', 'This session is reserved for an active key ceremony');
    }
  }
}
