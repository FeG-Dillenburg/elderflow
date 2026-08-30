import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import router from '../router';
import { externalAuthApi } from '../api/external-auth';
import LoginView from './LoginView.vue';

const stubs = {
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  Divider: { template: '<div class="divider"><slot /></div>' },
  InputText: { props: ['modelValue'], template: '<input />' },
  Message: { template: '<div><slot /></div>' },
  Password: { props: ['modelValue'], template: '<input />' },
};

describe('LoginView', () => {
  beforeEach(() => {
    vi.spyOn(externalAuthApi, 'publicProvider').mockResolvedValue(null);
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

  it('presents an enabled External provider first while keeping the full Local login form visible', async () => {
    vi.mocked(externalAuthApi.publicProvider).mockResolvedValue({ type: 'oidc', displayLabel: 'Company SSO' });
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs } });
    await flushPromises();

    expect(wrapper.get('.external-login').text()).toContain('Sign in with Company SSO');
    expect(wrapper.get('.divider').text()).toContain('or use Local login');
    expect(wrapper.get('.login-form').text()).toContain('Local login');
    expect(wrapper.findAll('.login-form input')).toHaveLength(2);
    expect(wrapper.get('.external-login').element.compareDocumentPosition(wrapper.get('.login-form').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
