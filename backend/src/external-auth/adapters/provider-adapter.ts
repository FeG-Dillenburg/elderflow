import { ExternalAuthProvider } from '../external-auth-provider.entity';
import { ExternalLoginTransaction } from '../external-login-transaction.entity';

export interface ExternalIdentityResult { subject: string; email: string }
export interface ExternalCallback { code: string }

export interface ProviderAdapter {
  createAuthorizationUrl(provider: ExternalAuthProvider, transaction: ExternalLoginTransaction, state: string): Promise<string>;
  exchange(provider: ExternalAuthProvider, transaction: ExternalLoginTransaction, callback: ExternalCallback): Promise<ExternalIdentityResult>;
}

export function callbackUrl(provider: ExternalAuthProvider): string {
  if (!provider.publicBaseUrl) throw new Error('AUTH_PROVIDER_CONFIGURATION_INCOMPLETE');
  return new URL('/api/auth/external/callback', `${provider.publicBaseUrl}/`).toString();
}
