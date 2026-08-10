import { translate } from '../i18n';

const REDACTED = '__ELDERFLOW_PROTECTED_TEXT_REDACTED__';
let unlocked = false;

export function setProtectedContentUnlocked(value: boolean): void {
  unlocked = value;
}

export function applyProtectedTextVisibility<T>(value: T): T {
  return localizeRedactions(value) as T;
}

export function getProtectedTextDevelopmentHeaders(): Record<string, string> {
  return isProtectedTextDevelopmentWriteAllowed()
    ? { 'X-Elderflow-E2EE-Unlocked': '1' }
    : {};
}

export function isProtectedTextDevelopmentWriteAllowed(): boolean {
  return import.meta.env.VITE_E2EE_DEVELOPMENT_GATE === 'true' && unlocked;
}

function localizeRedactions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(localizeRedactions);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => {
    if (item === REDACTED) {
      const locallyUnlockable = import.meta.env.VITE_E2EE_DEVELOPMENT_GATE === 'true' && !unlocked;
      return [key, translate(locallyUnlockable ? 'e2ee.lockedPlaceholder' : 'e2ee.unavailablePlaceholder')];
    }
    return [key, localizeRedactions(item)];
  }));
}
