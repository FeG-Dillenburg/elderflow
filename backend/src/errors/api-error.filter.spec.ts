import { BadRequestException, ConflictException, HttpStatus } from '@nestjs/common';
import { ApiErrorFilter, validationExceptionFactory } from './api-error.filter';

describe('API error responses', () => {
  it('returns a stable code and keeps the English diagnostic message', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/setup' }),
      }),
    };

    new ApiErrorFilter().catch(new ConflictException('System already setup'), host as any);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: HttpStatus.CONFLICT,
      code: 'INSTALLATION_ALREADY_CONFIGURED',
      message: 'System already setup',
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
});
