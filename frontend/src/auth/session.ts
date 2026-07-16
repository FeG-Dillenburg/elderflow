const TOKEN_KEY = 'elderflow.session';

const storage = (): Storage | null => {
  const candidate = typeof window === 'undefined' ? null : window.localStorage;
  return candidate && typeof candidate.getItem === 'function' ? candidate : null;
};

export const getSessionToken = (): string | null => storage()?.getItem(TOKEN_KEY) ?? null;
export const setSessionToken = (token: string): void => storage()?.setItem(TOKEN_KEY, token);
export const clearSessionToken = (): void => storage()?.removeItem(TOKEN_KEY);
