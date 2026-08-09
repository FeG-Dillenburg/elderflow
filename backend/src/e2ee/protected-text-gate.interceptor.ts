import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { map, Observable } from 'rxjs';
import { User } from '../users/user.entity';

export const PROTECTED_TEXT_REDACTED = '__ELDERFLOW_PROTECTED_TEXT_REDACTED__';
const PROTECTED_KEYS = new Set([
  'title',
  'description',
  'generalNotes',
  'openingInput',
  'agendaNote',
  'text',
  'preparationContext',
  'personNote',
  'meetingMinutes',
  'topicNameSnapshot',
  'godparents',
  'godparentsSnapshot',
  'membershipProcessStatus',
  'membershipProcessStatusSnapshot',
  'membershipStatusSignal',
  'membershipStatusSignalSnapshot',
]);

@Injectable()
export class ProtectedTextGateInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      body?: unknown;
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      originalUrl?: string;
      path?: string;
      url?: string;
      user?: User;
    }>();
    const rawPath = request.path ?? request.originalUrl ?? request.url ?? '';
    const path = rawPath.split('?', 1)[0];
    const contentEndpoint = ['/api/dashboard', '/api/meetings', '/api/topics', '/api/tasks']
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    const developmentGate = this.config.get<boolean>('E2EE_DEVELOPMENT_GATE') === true
      && this.config.get<string>('NODE_ENV') !== 'production';
    const clientUnlocked = request.headers?.['x-elderflow-e2ee-unlocked'] === '1';
    const plaintextAllowed = developmentGate && clientUnlocked && request.user?.role !== 'guest';
    const method = request.method?.toUpperCase() ?? 'GET';
    const mutating = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(method);

    if (contentEndpoint && mutating && !plaintextAllowed
      && containsProtectedText(request.body, path.startsWith('/api/topics'))) {
      throw new ForbiddenException({
        code: 'E2EE_PROTECTED_TEXT_WRITE_REQUIRED',
        message: 'Protected text must be written through the encrypted content path',
      });
    }

    const mustRedact = contentEndpoint && !plaintextAllowed;
    return mustRedact ? next.handle().pipe(map(redactProtectedText)) : next.handle();
  }
}

function containsProtectedText(value: unknown, topicBody = false): boolean {
  if (Array.isArray(value)) return value.some((item) => containsProtectedText(item));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return false;
  const source = value as Record<string, unknown>;
  return Object.entries(source).some(([key, item]) =>
    (PROTECTED_KEYS.has(key) || (key === 'name' && topicBody))
      ? typeof item === 'string' || item === null
      : containsProtectedText(item));
}

function redactProtectedText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProtectedText);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  const source = value as Record<string, unknown>;
  const topicShape = 'type' in source && ('status' in source || 'membershipStatusSignal' in source);
  return Object.fromEntries(Object.entries(source).map(([key, item]) => {
    const protectedName = key === 'name' && topicShape;
    if ((PROTECTED_KEYS.has(key) || protectedName) && (typeof item === 'string' || item === null)) {
      return [key, PROTECTED_TEXT_REDACTED];
    }
    return [key, redactProtectedText(item)];
  }));
}
