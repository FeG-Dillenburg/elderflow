import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type AuthUser } from '../api/domain';
import { externalAuthApi } from '../api/external-auth';
import { protectedText } from '../e2ee/protected-text';
import { currentLanguage, setLanguage } from '../i18n';
import { installation } from '../installation';
import { auth } from './auth';
import { getSessionToken } from './session';

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
  const storedValues = new Map<string, string>();

  beforeEach(() => {
    storedValues.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
        clear: () => storedValues.clear(),
        key: (index: number) => [...storedValues.keys()][index] ?? null,
        get length() { return storedValues.size; },
      } satisfies Storage,
    });
  });

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

  it('accepts an External completion exactly like a Local session', async () => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['en-US'],
    });
    vi.spyOn(externalAuthApi, 'complete').mockResolvedValue({ token: 'external-session-token', user });
    const unlock = vi.spyOn(protectedText, 'offerUnlock').mockResolvedValue();

    await auth.completeExternal('one-time-code');

    expect(externalAuthApi.complete).toHaveBeenCalledWith('one-time-code');
    expect(getSessionToken()).toBe('external-session-token');
    expect(auth.state.user).toEqual(user);
    expect(currentLanguage()).toBe('de');
    expect(unlock).toHaveBeenCalledWith(user);
  });
});
