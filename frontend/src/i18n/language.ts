export const supportedLanguages = ['en', 'de'] as const;

export type SupportedLanguage = typeof supportedLanguages[number];

export const detectSupportedLanguage = (languages: readonly string[]): SupportedLanguage | null => {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'de') return base;
  }
  return null;
};

export const resolveEffectiveLanguage = ({
  authenticated,
  userLanguage,
  installationDefault,
  browserLanguages,
}: {
  authenticated: boolean;
  userLanguage: SupportedLanguage | null;
  installationDefault: SupportedLanguage | null;
  browserLanguages: readonly string[];
}): SupportedLanguage => authenticated
  ? userLanguage ?? installationDefault ?? 'en'
  : detectSupportedLanguage(browserLanguages) ?? installationDefault ?? 'en';
