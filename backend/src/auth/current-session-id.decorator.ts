import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './current-user.decorator';

export interface SessionAuthenticatedRequest extends AuthenticatedRequest {
  sessionId: string;
}

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<SessionAuthenticatedRequest>().sessionId,
);
