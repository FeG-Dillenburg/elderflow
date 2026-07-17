import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';

interface ApiErrorPayload {
  statusCode?: number;
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

const codesByMessage: Record<string, string> = {
  'Invalid setup password': 'SETUP_PASSWORD_INVALID',
  'System already setup': 'INSTALLATION_ALREADY_CONFIGURED',
  'Installation state is inconsistent': 'INSTALLATION_STATE_INCONSISTENT',
  'Invalid email or password': 'AUTH_CREDENTIALS_INVALID',
  'Invalid session': 'AUTH_SESSION_INVALID',
  'Session expired': 'AUTH_SESSION_EXPIRED',
  'Session user does not exist': 'AUTH_USER_NOT_FOUND',
  'Authentication is required': 'AUTH_REQUIRED',
  'Your role does not allow this action': 'AUTH_FORBIDDEN',
  'A user with this email already exists': 'USER_EMAIL_CONFLICT',
  'User not found': 'USER_NOT_FOUND',
  'Meeting not found': 'MEETING_NOT_FOUND',
  'Topic not found': 'TOPIC_NOT_FOUND',
  'Task not found': 'TASK_NOT_FOUND',
  'Agenda section not found': 'AGENDA_SECTION_NOT_FOUND',
  'Agenda topic not found': 'AGENDA_TOPIC_NOT_FOUND',
  'Topic is already on this agenda': 'AGENDA_TOPIC_CONFLICT',
  'Position must be within the agenda section': 'AGENDA_POSITION_INVALID',
  'Agenda topic IDs must be unique': 'AGENDA_TOPIC_IDS_DUPLICATE',
  'Agenda changed; reload before reordering': 'AGENDA_CHANGED',
  'An agenda section does not exist': 'AGENDA_SECTION_INVALID',
  'Positions must be consecutive and start at 1 in every section': 'AGENDA_POSITIONS_INVALID',
};

const diagnosticMessage = (response: string | object, fallback: string): string => {
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  return fallback;
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = isHttpException ? exception.getResponse() : 'Internal server error';
    const provided = typeof rawResponse === 'object' ? rawResponse as Partial<ApiErrorPayload> : {};
    const message = diagnosticMessage(rawResponse, 'Internal server error');
    const payload: ApiErrorPayload = {
      statusCode,
      code: provided.code ?? codesByMessage[message] ?? `HTTP_${statusCode}`,
      message: provided.message ?? message,
      ...(provided.params ? { params: provided.params } : {}),
    };
    response.status(statusCode).json(payload);
  }
}

const flattenValidationErrors = (errors: ValidationError[], parent = ''): Array<{ field: string; constraint: string }> =>
  errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({ field, constraint }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });

export const validationExceptionFactory = (errors: ValidationError[]): BadRequestException =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed',
    params: { errors: flattenValidationErrors(errors) },
  });
