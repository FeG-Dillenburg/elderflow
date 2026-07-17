import { reactive } from 'vue';
import type { SupportedLanguage } from './i18n/language';

export const installation = reactive<{
  ready: boolean;
  setupRequired: boolean;
  defaultLanguage: SupportedLanguage | null;
}>({
  ready: false,
  setupRequired: true,
  defaultLanguage: null,
});

export const setupRedirect = (
  setupRequired: boolean,
  routeName: string | symbol | null | undefined,
): true | { name: 'setup' } => (
  setupRequired && routeName !== 'setup'
    ? { name: 'setup' }
    : true
);
