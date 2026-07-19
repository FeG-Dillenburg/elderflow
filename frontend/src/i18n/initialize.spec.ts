import { describe, expect, it, vi } from 'vitest';
import { loadApplicationContext } from './initialize';

describe('application localization initialization', () => {
  it('loads installation and authenticated user before selecting the effective language', async () => {
    const installation = vi.fn().mockResolvedValue({ setupRequired: false, defaultLanguage: 'en' });
    const currentUser = vi.fn().mockResolvedValue({ id: 'user', language: 'de' });

    await expect(loadApplicationContext({ installation, currentUser, hasSession: true, browserLanguages: ['en-US'] }))
      .resolves.toEqual(expect.objectContaining({ language: 'de', user: expect.objectContaining({ id: 'user' }) }));
    expect(installation).toHaveBeenCalledOnce();
    expect(currentUser).toHaveBeenCalledOnce();
  });

  it('uses browser language for setup and public pages but English when installation lookup fails', async () => {
    await expect(loadApplicationContext({
      installation: vi.fn().mockResolvedValue({ setupRequired: true, defaultLanguage: null }),
      currentUser: vi.fn(), hasSession: false, browserLanguages: ['de-DE'],
    })).resolves.toEqual(expect.objectContaining({ language: 'de', user: null }));

    await expect(loadApplicationContext({
      installation: vi.fn().mockRejectedValue(new Error('offline')),
      currentUser: vi.fn(), hasSession: false, browserLanguages: ['de-DE'],
    })).resolves.toEqual(expect.objectContaining({ language: 'en', installation: null, user: null }));
  });
});
