import { HttpStatus, Injectable } from '@nestjs/common';
import { codedHttpException } from '../../errors/coded-http.exception';
import { ExternalAuthProvider } from '../external-auth-provider.entity';
import { ExternalLoginTransaction } from '../external-login-transaction.entity';
import { ProviderHttpService } from '../provider-http.service';
import { ProviderUrlService } from '../provider-url.service';
import { callbackUrl, ExternalCallback, ExternalIdentityResult, ProviderAdapter } from './provider-adapter';

@Injectable()
export class ChurchToolsAdapter implements ProviderAdapter {
  constructor(private readonly http: ProviderHttpService, private readonly urls: ProviderUrlService) {}

  async createAuthorizationUrl(provider: ExternalAuthProvider, _transaction: ExternalLoginTransaction, state: string): Promise<string> {
    const base = this.base(provider);
    const url = new URL('/oauth/authorize', `${base}/`);
    await this.urls.assertSafe(url.toString());
    url.search = new URLSearchParams({ response_type: 'code', client_id: provider.clientId!, redirect_uri: callbackUrl(provider), state }).toString();
    return url.toString();
  }

  async exchange(provider: ExternalAuthProvider, transaction: ExternalLoginTransaction, callback: ExternalCallback): Promise<ExternalIdentityResult> {
    const base = this.base(provider);
    const token = await this.http.postForm(new URL('/oauth/access_token', `${base}/`).toString(), new URLSearchParams({
      grant_type: 'authorization_code', code: callback.code, client_id: provider.clientId!, redirect_uri: callbackUrl(provider), code_verifier: transaction.codeVerifier,
    }));
    if (typeof token.access_token !== 'string') throw this.invalid();
    const profile = await this.http.getJson(new URL('/oauth/userinfo', `${base}/`).toString(), `Bearer ${token.access_token}`);
    const nestedProfile = this.record(profile.data);
    const id = this.identityId(profile.id) ?? this.identityId(nestedProfile?.id);
    const email = this.identityEmail(profile.email) ?? this.identityEmail(nestedProfile?.email);
    if (id === null || email === null) throw this.invalid();
    return { subject: String(id), email };
  }

  private base(provider: ExternalAuthProvider): string {
    if (!provider.churchToolsUrl || !provider.clientId || !provider.publicBaseUrl) throw new Error('AUTH_PROVIDER_CONFIGURATION_INCOMPLETE');
    return provider.churchToolsUrl.replace(/\/$/, '');
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private identityId(value: unknown): string | number | null {
    return typeof value === 'string' && value.length > 0 || typeof value === 'number' && Number.isFinite(value)
      ? value
      : null;
  }

  private identityEmail(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private invalid() { return codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_IDENTITY_INVALID', 'Provider identity response is invalid'); }
}
