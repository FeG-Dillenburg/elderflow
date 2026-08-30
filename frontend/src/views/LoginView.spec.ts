import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import router from '../router';
import { externalAuthApi } from '../api/external-auth';
import { auth } from '../auth/auth';
import { installation } from '../installation';
import LoginView from './LoginView.vue';

const stubs = {
  Button: { props: ['label', 'loading'], template: '<button :data-loading="loading">{{ label }}</button>' },
  Divider: { template: '<div class="divider"><slot /></div>' },
  InputText: { props: ['modelValue'], template: '<input />' },
  Message: { template: '<div><slot /></div>' },
  Password: { props: ['modelValue'], template: '<input />' },
};

describe('LoginView', () => {
  beforeEach(async () => {
    installation.setupRequired = false;
    auth.completeInitialization(null);
    vi.spyOn(externalAuthApi, 'publicProvider').mockResolvedValue(null);
    await router.push('/login');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the colorful Elderflow wordmark', () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
        stubs,
      },
    });

    expect(wrapper.get('.brand-wordmark').attributes()).toMatchObject({
      alt: 'Elderflow',
      src: '/elderflow-wordmark-color.png',
    });
  });

  it('shows only the complete Local login when no usable provider is published', async () => {
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.find('.external-login').exists()).toBe(false);
    expect(wrapper.find('.divider').exists()).toBe(false);
    expect(wrapper.findAll('.login-form input')).toHaveLength(2);
  });

  it.each([
    ['oidc', 'Company SSO'],
    ['churchtools', 'ChurchTools'],
  ] as const)('presents the enabled %s provider first while keeping Local login visible', async (type, displayLabel) => {
    vi.mocked(externalAuthApi.publicProvider).mockResolvedValue({ type, displayLabel });
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.get('.external-login').text()).toContain(`Sign in with ${displayLabel}`);
    expect(wrapper.get('.divider').text()).toContain('or use Local login');
    expect(wrapper.get('.login-form').text()).toContain('Local login');
    expect(wrapper.findAll('.login-form input')).toHaveLength(2);
    expect(wrapper.get('.external-login').element.compareDocumentPosition(wrapper.get('.login-form').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('falls back to Local login when provider discovery is unavailable', async () => {
    vi.mocked(externalAuthApi.publicProvider).mockRejectedValue(new Error('unavailable'));
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.find('.external-login').exists()).toBe(false);
    expect(wrapper.findAll('.login-form input')).toHaveLength(2);
  });

  it('shows a provider cancellation/failure without hiding Local login', async () => {
    await router.push('/login?externalError=AUTH_EXTERNAL_LOGIN_FAILED');
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('External login was not completed');
    expect(wrapper.findAll('.login-form input')).toHaveLength(2);
  });

  it('shows loading while starting External login and forwards the safe return path', async () => {
    vi.mocked(externalAuthApi.publicProvider).mockResolvedValue({ type: 'oidc', displayLabel: 'Company SSO' });
    vi.spyOn(externalAuthApi, 'startLogin').mockReturnValue(new Promise(() => undefined));
    await router.push('/login?redirect=/meetings');
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    await wrapper.get('.external-login').trigger('click');

    expect(externalAuthApi.startLogin).toHaveBeenCalledWith('/meetings');
    expect(wrapper.get('.external-login').attributes('data-loading')).toBe('true');
  });
});
