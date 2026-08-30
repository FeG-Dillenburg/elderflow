import { createHash } from 'node:crypto';

export interface FingerprintConfiguration {
  type: 'oidc' | 'churchtools';
  issuerUrl: string | null;
  churchToolsUrl: string | null;
  clientId: string | null;
  publicBaseUrl: string | null;
  clientSecretEnvelope: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function configurationFingerprint(configuration: FingerprintConfiguration): string {
  return sha256(JSON.stringify([
    configuration.type,
    configuration.issuerUrl,
    configuration.churchToolsUrl,
    configuration.clientId,
    configuration.publicBaseUrl,
    configuration.clientSecretEnvelope ? sha256(configuration.clientSecretEnvelope) : null,
  ]));
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return '/';
    const parsed = new URL(value, 'https://elderflow.invalid');
    return parsed.origin === 'https://elderflow.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch {
    return '/';
  }
}
