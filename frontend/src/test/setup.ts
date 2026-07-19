import { config } from '@vue/test-utils';
import { afterEach, vi } from 'vitest';
import { i18n, setLanguage } from '../i18n';

config.global.plugins = [i18n];

config.global.stubs = {
  ...config.global.stubs,
  Password: { props: ['modelValue'], template: '<input />' },
  Select: { props: ['modelValue', 'options', 'optionLabel', 'optionValue', 'placeholder'], template: '<select />' },
};

afterEach(() => {
  setLanguage('en');
  vi.unstubAllGlobals();
});
