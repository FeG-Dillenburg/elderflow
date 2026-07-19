import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth/auth';
import { currentLanguage, setLanguage } from '../i18n';
import ProfileView from './ProfileView.vue';

const permissions = { dashboard: 'view', users: 'hide', references: 'view', meetings: 'view', topics: 'view', tasks: 'view', contentSettings: 'hide', authSettings: 'hide' } as const;

describe('ProfileView language preference', () => {
  afterEach(() => { auth.state.user = null; setLanguage('en'); vi.restoreAllMocks(); });

  it('applies a language preference only after the profile save succeeds', async () => {
    auth.state.user = { id: 'user', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'user', language: null, permissions };
    setLanguage('en');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...auth.state.user, language: 'de' }),
    }));
    const wrapper = mount(ProfileView, { global: { stubs: {
      Button: { props: ['label'], template: '<button>{{ label }}</button>' },
      InputText: { props: ['modelValue'], template: '<input />' },
      Password: { props: ['modelValue'], template: '<input />' },
      Select: { props: ['modelValue'], template: '<select />' },
      Message: { template: '<div><slot /></div>' },
    } } });
    const vm = wrapper.vm as unknown as { form: { language: 'de' }; submit: () => Promise<void> };
    vm.form.language = 'de';

    expect(currentLanguage()).toBe('en');
    await vm.submit();
    await flushPromises();
    expect(currentLanguage()).toBe('de');
    expect(auth.state.user?.language).toBe('de');
  });
});
