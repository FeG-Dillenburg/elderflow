import { describe, expect, it } from 'vitest';
import { detectSupportedLanguage, resolveEffectiveLanguage } from './language';

describe('language resolution', () => {
  it('selects the first supported browser language and maps regional variants', () => {
    expect(detectSupportedLanguage(['fr-FR', 'de-CH', 'en-US'])).toBe('de');
    expect(detectSupportedLanguage(['en-GB', 'de-DE'])).toBe('en');
    expect(detectSupportedLanguage(['fr', 'it'])).toBeNull();
  });

  it('prioritizes user preference and installation default for authenticated users', () => {
    expect(resolveEffectiveLanguage({ authenticated: true, userLanguage: 'de', installationDefault: 'en', browserLanguages: ['en'] })).toBe('de');
    expect(resolveEffectiveLanguage({ authenticated: true, userLanguage: null, installationDefault: 'de', browserLanguages: ['en'] })).toBe('de');
    expect(resolveEffectiveLanguage({ authenticated: true, userLanguage: null, installationDefault: null, browserLanguages: ['de'] })).toBe('en');
  });

  it('prioritizes the browser for public pages and pre-setup pages', () => {
    expect(resolveEffectiveLanguage({ authenticated: false, userLanguage: null, installationDefault: 'en', browserLanguages: ['de-AT'] })).toBe('de');
    expect(resolveEffectiveLanguage({ authenticated: false, userLanguage: null, installationDefault: 'de', browserLanguages: ['fr'] })).toBe('de');
    expect(resolveEffectiveLanguage({ authenticated: false, userLanguage: null, installationDefault: null, browserLanguages: ['fr'] })).toBe('en');
  });
});
