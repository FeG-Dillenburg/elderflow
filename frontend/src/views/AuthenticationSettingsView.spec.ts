import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { externalAuthApi } from '../api/external-auth';
import { auth } from '../auth/auth';
import router from '../router';
import AuthenticationSettingsView from './AuthenticationSettingsView.vue';

const stubs = {
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  Checkbox: { template: '<input type="checkbox" />' },
  InputText: { props: ['modelValue', 'type'], emits: ['update:modelValue'], template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  Message: { template: '<div><slot /></div>' },
  Password: { props: ['modelValue'], template: '<input type="password" :value="modelValue" />' },
  Select: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  Tag: { props: ['value'], template: '<span>{{ value }}</span>' },
};

describe('AuthenticationSettingsView', () => {
  beforeEach(async () => {
    auth.completeInitialization({
      id: 'admin', email: 'admin@example.com', firstName: 'Admin', lastName: 'User', role: 'superadmin', language: 'en',
      permissions: { dashboard: 'manage', users: 'manage', references: 'view', meetings: 'manage', topics: 'manage', tasks: 'manage', contentSettings: 'manage', authSettings: 'manage' },
    });
    vi.spyOn(externalAuthApi, 'settings').mockResolvedValue(null);
    vi.spyOn(externalAuthApi, 'users').mockResolvedValue([]);
    await router.push('/authentication-settings');
    await router.isReady();
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
});
