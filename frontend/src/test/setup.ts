import { config } from '@vue/test-utils';
import { afterEach, vi } from 'vitest';

config.global.stubs = {
  ...config.global.stubs,
  Password: { props: ['modelValue'], template: '<input />' },
  Select: { props: ['modelValue'], template: '<select />' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});
