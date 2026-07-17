import { describe, expect, it } from 'vitest';
import { currentLanguage, formatTime, i18n, primeVueLocale, setLanguage } from '.';

describe('framework locale synchronization', () => {
  it('synchronizes Vue I18n, PrimeVue, and the document language', () => {
    setLanguage('de');
    expect(currentLanguage()).toBe('de');
    expect(i18n.global.locale.value).toBe('de');
    expect(primeVueLocale.today).toBe('Heute');
    expect(primeVueLocale.firstDayOfWeek).toBe(1);
    expect(document.documentElement.lang).toBe('de');
    expect(formatTime('14:30:00')).toBe('14:30');
  });
});
