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
      code: provided.code ?? `HTTP_${statusCode}`,
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
