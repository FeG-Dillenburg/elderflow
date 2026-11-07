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
  let installationInformation: InstallationInformation;
  try {
    installationInformation = await installation();
  } catch {
    return { installation: null, user: null, language: 'en' };
  }
  const user = hasSession || allowDevelopmentIdentity
    ? await currentUser().catch(() => null)
    : null;
  return {
    installation: installationInformation,
    user,
    language: resolveEffectiveLanguage({
      authenticated: Boolean(user),
      userLanguage: user?.language ?? null,
      installationDefault: installationInformation.defaultLanguage,
      browserLanguages,
    }),
  };
};
