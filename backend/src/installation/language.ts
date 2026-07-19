export const supportedLanguages = ['en', 'de'] as const;

export type SupportedLanguage = typeof supportedLanguages[number];
