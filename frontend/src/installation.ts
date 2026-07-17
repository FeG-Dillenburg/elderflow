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
