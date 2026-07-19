import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AuthUser } from '../api/domain';
import { currentLanguage, setLanguage } from '../i18n';
import { installation } from '../installation';
import { auth } from './auth';

const user: AuthUser = {
  id: 'user-id',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'superadmin',
  language: 'de',
  permissions: {
    dashboard: 'manage',
    users: 'manage',
    references: 'manage',
    meetings: 'manage',
    topics: 'manage',
    tasks: 'manage',
    contentSettings: 'manage',
    authSettings: 'manage',
  },
};

describe('authentication language synchronization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    installation.defaultLanguage = null;
    setLanguage('en');
  });

  it('applies the user language on login and the public-page language on logout', async () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['en-US'],
    });
    installation.defaultLanguage = 'de';
    vi.spyOn(api, 'login').mockResolvedValue({ token: 'session-token', user });

    await auth.login('ada@example.com', 'password123!');
    expect(currentLanguage()).toBe('de');

    auth.logout();
    expect(currentLanguage()).toBe('en');
  });
});
