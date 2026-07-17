import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupView from './SetupView.vue';
import { installation } from '../installation';

const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  InputText: { props: ['modelValue'], template: '<input />' },
  Password: { props: ['modelValue'], template: '<input />' },
  Message: { template: '<div><slot /></div>' },
};

describe('SetupView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installation.setupRequired = true;
    installation.defaultLanguage = null;
  });

  it('shows the required message when the system already has a user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: false, defaultLanguage: 'en' }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('System already setup');
    expect(wrapper.html()).toContain('href="/login"');
  });

  it('verifies the startup password before displaying the first-user form', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('Setup password');

    const vm = wrapper.vm as unknown as { setupPassword: string; verifyPassword: () => Promise<void>; stage: string };
    vm.setupPassword = 'startup-password';
    await vm.verifyPassword();

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/setup/verify', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ setupPassword: 'startup-password' }),
    }));
    expect(vm.stage).toBe('user');
    expect(wrapper.text()).toContain('Create superadmin');
  });

  it('creates the initial user without allowing the role to be selected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'user-id', role: 'superadmin' }) });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      stage: string;
      setupPassword: string;
      form: { email: string; firstName: string; lastName: string; password: string; passwordConfirmation: string };
      createUser: () => Promise<void>;
    };
    vm.stage = 'user';
    vm.setupPassword = 'startup-password';
    Object.assign(vm.form, {
      email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!', passwordConfirmation: 'password123!',
    });
    await vm.createUser();

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/setup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        setupPassword: 'startup-password', defaultLanguage: 'en', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!',
      }),
    }));
    expect(vm.stage).toBe('complete');
    expect(installation.setupRequired).toBe(false);
    expect(installation.defaultLanguage).toBe('en');
    expect(wrapper.text()).toContain('Setup complete');
  });

  it('preselects a regional browser language and switches the setup screen immediately', async () => {
    vi.stubGlobal('navigator', { languages: ['de-CH', 'en'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();

    const vm = wrapper.vm as unknown as { defaultLanguage: string };
    expect(vm.defaultLanguage).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(wrapper.text()).toContain('Systemeinrichtung');
  });

  it('keeps the user form open when password confirmation differs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      stage: string;
      form: { password: string; passwordConfirmation: string };
      errorMessage: string;
      createUser: () => Promise<void>;
    };
    vm.stage = 'user';
    vm.form.password = 'password123!';
    vm.form.passwordConfirmation = 'different-password';
    await vm.createUser();
    expect(vm.errorMessage).toBe('Passwords do not match');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
