import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import router from '../router';
import LoginView from './LoginView.vue';

const stubs = {
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  InputText: { props: ['modelValue'], template: '<input />' },
  Message: { template: '<div><slot /></div>' },
  Password: { props: ['modelValue'], template: '<input />' },
};

describe('LoginView', () => {
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
});
