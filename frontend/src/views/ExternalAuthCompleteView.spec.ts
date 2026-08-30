import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { externalAuthApi } from '../api/external-auth';
import { auth } from '../auth/auth';
import { getSessionToken } from '../auth/session';
import { protectedText } from '../e2ee/protected-text';
import { currentLanguage } from '../i18n';
import { installation } from '../installation';
import router from '../router';
import ExternalAuthCompleteView from './ExternalAuthCompleteView.vue';

const stubs = {
  Message: { template: '<div><slot /></div>' },
  ProgressSpinner: { template: '<div class="spinner" />' },
};

const user = {
  id: 'user-id',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'user' as const,
  language: 'en' as const,
  permissions: {
    dashboard: 'view' as const,
    users: 'hide' as const,
    references: 'view' as const,
    meetings: 'view' as const,
    topics: 'view' as const,
    tasks: 'view' as const,
    contentSettings: 'hide' as const,
    authSettings: 'hide' as const,
  },
};

describe('ExternalAuthCompleteView', () => {
  const storedValues = new Map<string, string>();

  beforeEach(() => {
    installation.setupRequired = false;
    auth.completeInitialization(null);
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
  });

  it('exchanges the completion code and safely restores the requested route', async () => {
    vi.spyOn(externalAuthApi, 'complete').mockResolvedValue({ token: 'external-session', user });
    const unlock = vi.spyOn(protectedText, 'offerUnlock').mockResolvedValue();
    await router.push('/auth/external/complete?code=single-use&return=%2Fmeetings%3Fview%3Dmine');
    const wrapper = mount(ExternalAuthCompleteView, { global: { plugins: [router], stubs } });

    await flushPromises();

    expect(externalAuthApi.complete).toHaveBeenCalledWith('single-use');
    expect(getSessionToken()).toBe('external-session');
    expect(auth.state.user).toEqual(user);
    expect(currentLanguage()).toBe('en');
    expect(unlock).toHaveBeenCalledWith(user);
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/meetings?view=mine');
    });
    wrapper.unmount();
  });

  it('rejects an unsafe return path', async () => {
    vi.spyOn(externalAuthApi, 'complete').mockResolvedValue({ token: 'external-session', user });
    vi.spyOn(protectedText, 'offerUnlock').mockResolvedValue();
    await router.push('/auth/external/complete?code=single-use&return=%2F%2Fevil.example');
    const wrapper = mount(ExternalAuthCompleteView, { global: { plugins: [router], stubs } });

    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/');
    wrapper.unmount();
  });

  it('handles a failed exchange through Local login', async () => {
    vi.spyOn(externalAuthApi, 'complete').mockRejectedValue(new Error('expired'));
    await router.push('/auth/external/complete?code=expired');
    const wrapper = mount(ExternalAuthCompleteView, { global: { plugins: [router], stubs } });

    await flushPromises();

    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/login');
    });
    expect(router.currentRoute.value.query.externalError).toBe('AUTH_EXTERNAL_LOGIN_FAILED');
    wrapper.unmount();
  });
});
