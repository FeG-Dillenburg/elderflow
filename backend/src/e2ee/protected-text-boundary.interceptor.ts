import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

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
]);

@Injectable()
export class ProtectedTextBoundaryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      body?: unknown;
      method?: string;
      originalUrl?: string;
      path?: string;
      url?: string;
    }>();
    const rawPath = request.path ?? request.originalUrl ?? request.url ?? '';
    const path = rawPath.split('?', 1)[0];
    const contentEndpoint = ['/api/dashboard', '/api/meetings', '/api/topics', '/api/tasks']
      .some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    const method = request.method?.toUpperCase() ?? 'GET';
    const mutating = !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(method);

    if (contentEndpoint && mutating
      && containsProtectedText(request.body, path.startsWith('/api/topics'))) {
      throw new ForbiddenException({
        code: 'E2EE_PROTECTED_TEXT_WRITE_REQUIRED',
        message: 'Protected text must be written through the encrypted content path',
      });
    }

    return next.handle();
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
