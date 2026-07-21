import { BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import { ApiErrorFilter, validationExceptionFactory } from './api-error.filter';
import { codedHttpException } from './coded-http.exception';

describe('API error responses', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a stable code and keeps the English diagnostic message', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/setup' }),
      }),
    };

    new ApiErrorFilter().catch(codedHttpException(
      HttpStatus.CONFLICT,
      'INSTALLATION_ALREADY_CONFIGURED',
      'The installation has already been configured',
    ), host as any);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: HttpStatus.CONFLICT,
      code: 'INSTALLATION_ALREADY_CONFIGURED',
      message: 'The installation has already been configured',
    }));
  });

  it('returns structured validation fields and constraints', () => {
    const exception = validationExceptionFactory([{
      property: 'defaultLanguage',
      constraints: { isIn: 'defaultLanguage must be one of the following values: en, de' },
      children: [],
    } as any]) as BadRequestException;

    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      params: { errors: [{ field: 'defaultLanguage', constraint: 'isIn' }] },
    });
  });

  it('logs unexpected exceptions with request context and keeps the response generic', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'PUT', url: '/api/topics/topic' }),
      }),
    };
    const exception = new Error('Database query failed');

    new ApiErrorFilter().catch(exception, host as any);

    expect(log).toHaveBeenCalledWith(
      'Unhandled exception during PUT /api/topics/topic',
      exception.stack,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'HTTP_500',
      message: 'Internal server error',
    });
  });

  it('does not log expected HTTP exceptions as server errors', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'PUT', url: '/api/topics/topic' }),
      }),
    };

    new ApiErrorFilter().catch(new BadRequestException('Invalid topic'), host as any);

    expect(log).not.toHaveBeenCalled();
  });
});
