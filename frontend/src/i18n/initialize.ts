import { resolveEffectiveLanguage, SupportedLanguage } from './language';

interface InstallationInformation {
  setupRequired: boolean;
  defaultLanguage: SupportedLanguage | null;
}

interface LanguageUser {
  language: SupportedLanguage | null;
}

export const loadApplicationContext = async <TUser extends LanguageUser>({
  installation,
  currentUser,
  hasSession,
  allowDevelopmentIdentity = false,
  browserLanguages,
}: {
  installation: () => Promise<InstallationInformation>;
  currentUser: () => Promise<TUser>;
  hasSession: boolean;
  allowDevelopmentIdentity?: boolean;
  browserLanguages: readonly string[];
}): Promise<{ installation: InstallationInformation | null; user: TUser | null; language: SupportedLanguage }> => {
  const [installationResult, userResult] = await Promise.allSettled([
    installation(),
    hasSession || allowDevelopmentIdentity ? currentUser() : Promise.resolve(null),
  ]);
  if (installationResult.status === 'rejected') {
    return { installation: null, user: null, language: 'en' };
  }
  const user = userResult.status === 'fulfilled' ? userResult.value : null;
  return {
    installation: installationResult.value,
    user,
    language: resolveEffectiveLanguage({
      authenticated: Boolean(user),
      userLanguage: user?.language ?? null,
      installationDefault: installationResult.value.defaultLanguage,
      browserLanguages,
    }),
  };
};
