import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { externalAuthApi } from '../api/external-auth';
import { auth } from '../auth/auth';
import { installation } from '../installation';
import router from '../router';
import AuthenticationSettingsView from './AuthenticationSettingsView.vue';

const stubs = {
  Button: { props: ['label', 'loading', 'disabled'], template: '<button :disabled="disabled" :data-loading="loading">{{ label }}</button>' },
  Checkbox: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />' },
  InputText: { props: ['modelValue', 'type'], emits: ['update:modelValue'], template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  Message: { template: '<div><slot /></div>' },
  Password: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="password" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  Select: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
};

const providerSettings = (overrides = {}) => ({
  id: 'provider-id',
  type: 'oidc' as const,
  displayLabel: 'Company SSO',
  issuerUrl: 'https://identity.example.com',
  churchToolsUrl: null,
  clientId: 'elderflow',
  publicBaseUrl: window.location.origin,
  callbackUrl: `${window.location.origin}/api/auth/external/callback`,
  clientSecretConfigured: false,
  enabled: false,
  testedAt: null,
  canEnable: false,
  status: 'draft' as const,
  diagnosticCode: null,
  ...overrides,
});

describe('AuthenticationSettingsView', () => {
  beforeEach(async () => {
    installation.setupRequired = false;
    auth.completeInitialization({
      id: 'admin', email: 'admin@example.com', firstName: 'Admin', lastName: 'User', role: 'superadmin', language: 'en',
      permissions: { dashboard: 'manage', users: 'manage', references: 'view', meetings: 'manage', topics: 'manage', tasks: 'manage', contentSettings: 'manage', authSettings: 'manage' },
    });
    vi.spyOn(externalAuthApi, 'settings').mockResolvedValue(null);
    vi.spyOn(externalAuthApi, 'users').mockResolvedValue([]);
    await router.push('/authentication-settings');
    await router.isReady();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefills the public origin and shows only fields for the selected provider type', async () => {
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Issuer URL');
    expect(wrapper.text()).not.toContain('ChurchTools installation URL');
    expect(wrapper.findAll('input').some((input) => input.element.value === window.location.origin)).toBe(true);

    await wrapper.get('select').setValue('churchtools');
    expect(wrapper.text()).toContain('ChurchTools installation URL');
    expect(wrapper.text()).not.toContain('Issuer URL');
    expect(wrapper.text()).not.toContain('Client secret');
  });

  it('loads active-user link status immediately after the first provider save', async () => {
    vi.spyOn(externalAuthApi, 'save').mockResolvedValue(providerSettings());
    vi.mocked(externalAuthApi.users).mockResolvedValue([
      { id: 'user-id', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', linked: false },
    ]);
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(externalAuthApi.users).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Ada Lovelace');
    expect(wrapper.text()).toContain('Unlinked');
  });

  it('never displays a saved secret and exposes explicit replace/remove controls', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings({ clientSecretConfigured: true }));
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Replace client secret');
    expect(wrapper.text()).toContain('Remove the saved client secret');
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.html()).not.toContain('clientSecretEnvelope');
  });

  it('emits explicit secret replacement and removal requests without exposing the saved value', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings({ clientSecretConfigured: true }));
    vi.spyOn(externalAuthApi, 'save').mockResolvedValue(providerSettings({ clientSecretConfigured: true }));
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    await wrapper.get('input[type="password"]').setValue('replacement-secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(externalAuthApi.save).toHaveBeenLastCalledWith(expect.objectContaining({
      clientSecret: 'replacement-secret',
      removeClientSecret: false,
    }));

    await wrapper.get('input[type="password"]').setValue('');
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(externalAuthApi.save).toHaveBeenLastCalledWith(expect.objectContaining({
      clientSecret: undefined,
      removeClientSecret: true,
    }));
  });

  it('copies the fixed callback URL', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    const copyButton = wrapper.findAll('button').find((button) => button.text() === 'Copy callback URL');
    await copyButton!.trigger('click');

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/api/auth/external/callback`);
    expect(wrapper.text()).toContain('Callback URL copied.');
  });

  it('renders tested/disabled state and safe provider diagnostics', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings({
      testedAt: '2026-08-30T12:00:00.000Z',
      canEnable: true,
      status: 'tested-disabled',
      diagnosticCode: 'AUTH_PROVIDER_DNS_FAILED',
    }));
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Tested — disabled');
    expect(wrapper.text()).toContain('The provider host could not be resolved.');
    expect(wrapper.text()).toContain('Enable');
    expect(wrapper.text()).toContain('Test provider login');
  });

  it('loads a completed test diagnostic from the callback transition', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings());
    vi.spyOn(externalAuthApi, 'testResult').mockResolvedValue({
      pending: false,
      code: 'AUTH_PROVIDER_TEST_SUCCEEDED',
    });
    await router.push('/authentication-settings?test=test-transaction');
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(externalAuthApi.testResult).toHaveBeenCalledWith('test-transaction');
    expect(wrapper.text()).toContain('The provider login test succeeded.');
  });

  it('drives test, enable, disable, and remove transitions with confirmations', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings({
      testedAt: '2026-08-30T12:00:00.000Z',
      canEnable: true,
      status: 'tested-disabled',
    }));
    vi.spyOn(externalAuthApi, 'startTest').mockReturnValue(new Promise(() => undefined));
    vi.spyOn(externalAuthApi, 'enable').mockResolvedValue(providerSettings({ enabled: true, status: 'enabled' }));
    vi.spyOn(externalAuthApi, 'disable').mockResolvedValue(providerSettings({ status: 'tested-disabled' }));
    vi.spyOn(externalAuthApi, 'remove').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Test provider login')!.trigger('click');
    expect(externalAuthApi.startTest).toHaveBeenCalledOnce();

    await wrapper.findAll('button').find((button) => button.text() === 'Enable')!.trigger('click');
    await flushPromises();
    expect(externalAuthApi.enable).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Enabled');

    await wrapper.findAll('button').find((button) => button.text() === 'Disable')!.trigger('click');
    await flushPromises();
    expect(externalAuthApi.disable).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Tested — disabled');

    await wrapper.findAll('button').find((button) => button.text() === 'Remove provider')!.trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(externalAuthApi.remove).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Not configured');
  });

  it('shows test invalidation immediately when a connection-sensitive save returns to draft', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings({
      testedAt: '2026-08-30T12:00:00.000Z',
      canEnable: true,
      status: 'tested-disabled',
    }));
    vi.spyOn(externalAuthApi, 'save').mockResolvedValue(providerSettings({
      publicBaseUrl: 'https://new.example.com',
      callbackUrl: 'https://new.example.com/api/auth/external/callback',
      status: 'draft',
      testedAt: null,
      canEnable: false,
    }));
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Draft — test required');
    const enableButton = wrapper.findAll('button').find((button) => button.text() === 'Enable');
    expect(enableButton!.attributes()).toHaveProperty('disabled');
  });

  it('shows linked and unlinked active Users and resets a link without changing the User', async () => {
    vi.mocked(externalAuthApi.settings).mockResolvedValue(providerSettings());
    vi.mocked(externalAuthApi.users).mockResolvedValue([
      { id: 'linked-id', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', linked: true },
      { id: 'unlinked-id', email: 'grace@example.com', firstName: 'Grace', lastName: 'Hopper', linked: false },
    ]);
    vi.spyOn(externalAuthApi, 'resetLink').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Ada Lovelace');
    expect(wrapper.text()).toContain('Grace Hopper');
    expect(wrapper.text()).toContain('Linked');
    expect(wrapper.text()).toContain('Unlinked');
    const resetButton = wrapper.findAll('button').find((button) => button.text() === 'Reset link');
    await resetButton!.trigger('click');
    await flushPromises();

    expect(externalAuthApi.resetLink).toHaveBeenCalledWith('linked-id');
    expect(wrapper.text()).toContain('External identity link reset.');
    expect(wrapper.text()).not.toContain('LinkedReset link');
  });

  it.each(['admin', 'user', 'guest'] as const)('keeps the route inaccessible to the %s role', async (role) => {
    auth.completeInitialization({
      id: role, email: `${role}@example.com`, firstName: 'No', lastName: 'Access', role, language: 'en',
      permissions: { dashboard: 'view', users: 'hide', references: 'view', meetings: 'view', topics: 'view', tasks: 'view', contentSettings: 'hide', authSettings: 'hide' },
    });

    await router.push('/');
    await router.push('/authentication-settings');

    expect(router.currentRoute.value.path).toBe('/');
  });

  it('allows an IT administrator to mount Authentication settings', async () => {
    auth.completeInitialization({
      id: 'it-admin', email: 'it@example.com', firstName: 'IT', lastName: 'Admin', role: 'it-admin', language: 'en',
      permissions: { dashboard: 'view', users: 'manage', references: 'view', meetings: 'view', topics: 'view', tasks: 'view', contentSettings: 'manage', authSettings: 'manage' },
    });
    await router.push('/authentication-settings');
    const wrapper = mount(AuthenticationSettingsView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/authentication-settings');
    expect(wrapper.text()).toContain('Authentication settings');
  });
});
