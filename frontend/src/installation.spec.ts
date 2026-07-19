import { describe, expect, it } from 'vitest';
import { setupRedirect } from './installation';

describe('setupRedirect', () => {
  it('redirects every non-setup route while installation setup is required', () => {
    expect(setupRedirect(true, 'login')).toEqual({ name: 'setup' });
    expect(setupRedirect(true, 'dashboard')).toEqual({ name: 'setup' });
  });

  it('allows setup itself and all routes after installation setup', () => {
    expect(setupRedirect(true, 'setup')).toBe(true);
    expect(setupRedirect(false, 'dashboard')).toBe(true);
  });
});
