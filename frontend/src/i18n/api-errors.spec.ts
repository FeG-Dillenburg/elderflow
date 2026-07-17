import { describe, expect, it } from 'vitest';
import { localizeApiError } from './api-errors';

describe('localized API errors', () => {
  it('localizes known codes and falls back to the English diagnostic for unknown codes', () => {
    const translate = (key: string) => key === 'errors.codes.AUTH_CREDENTIALS_INVALID' ? 'E-Mail-Adresse oder Passwort ist ungültig' : key;
    expect(localizeApiError({ code: 'AUTH_CREDENTIALS_INVALID', message: 'Invalid email or password' }, translate)).toBe('E-Mail-Adresse oder Passwort ist ungültig');
    expect(localizeApiError({ code: 'FUTURE_ERROR', message: 'Future diagnostic' }, translate)).toBe('Future diagnostic');
  });

  it('falls back safely when an error payload is unavailable', () => {
    expect(localizeApiError(null, () => 'errors.requestFailed')).toBe('errors.requestFailed');
  });

  it('localizes structured validation errors without parsing backend prose', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      if (key === 'errors.fields.email') return 'Email address';
      if (key === 'errors.constraints.isEmail') return 'Enter a valid email address';
      return key === 'errors.validation'
        ? `${params?.field}: ${params?.constraint}.`
        : key;
    };
    expect(localizeApiError({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      params: { errors: [{ field: 'email', constraint: 'isEmail' }] },
    }, translate)).toBe('Email address: Enter a valid email address.');
  });
});
