import { createI18n } from 'vue-i18n';
import de from './messages/de';
import en from './messages/en';
import { SupportedLanguage } from './language';

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, de },
});

export const primeVueLocale = { ...en.primevue };
let installedPrimeVueLocale: object | null = null;

const primeVueMessages = (language: SupportedLanguage): Record<string, unknown> =>
  language === 'de' ? de.primevue : en.primevue;

export const bindPrimeVueLocale = (locale: object): (() => void) => {
  installedPrimeVueLocale = locale;
  Object.assign(locale, primeVueMessages(currentLanguage()));
  return () => {
    if (installedPrimeVueLocale === locale) installedPrimeVueLocale = null;
  };
};

export const setLanguage = (language: SupportedLanguage): void => {
  i18n.global.locale.value = language;
  const messages = primeVueMessages(language);
  Object.assign(primeVueLocale, messages);
  if (installedPrimeVueLocale) Object.assign(installedPrimeVueLocale, messages);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
};

export const currentLanguage = (): SupportedLanguage => i18n.global.locale.value as SupportedLanguage;

export const dateInputFormat = (): string => currentLanguage() === 'de' ? 'dd.mm.yy' : 'mm/dd/yy';

export const translate = (key: string, params?: Record<string, unknown>): string =>
  i18n.global.t(key, params ?? {}) as string;

export const formatDate = (value: string | Date, options?: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(currentLanguage(), options).format(typeof value === 'string' ? new Date(value) : value);

export const formatTime = (value: string): string => {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(currentLanguage(), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
