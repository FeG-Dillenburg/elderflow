import { describe, expect, it } from 'vitest';
import { isProviderTestReturn } from './provider-test-return';

describe('provider test return detection', () => {
  it('matches only Authentication Settings callbacks with a test transaction', () => {
    expect(isProviderTestReturn({ pathname: '/authentication-settings', search: '?test=transaction-id' })).toBe(true);
    expect(isProviderTestReturn({ pathname: '/authentication-settings', search: '' })).toBe(false);
    expect(isProviderTestReturn({ pathname: '/meetings', search: '?test=transaction-id' })).toBe(false);
  });
});
