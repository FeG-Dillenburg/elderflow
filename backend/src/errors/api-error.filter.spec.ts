import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ApiErrorFilter, validationExceptionFactory } from './api-error.filter';
import { codedHttpException } from './coded-http.exception';

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
});
