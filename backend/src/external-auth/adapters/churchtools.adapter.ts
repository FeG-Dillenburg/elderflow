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
    if ((typeof profile.id !== 'string' && typeof profile.id !== 'number') || typeof profile.email !== 'string' || !profile.email.trim()) throw this.invalid();
    return { subject: String(profile.id), email: profile.email };
  }

  private base(provider: ExternalAuthProvider): string {
    if (!provider.churchToolsUrl || !provider.clientId || !provider.publicBaseUrl) throw new Error('AUTH_PROVIDER_CONFIGURATION_INCOMPLETE');
    return provider.churchToolsUrl.replace(/\/$/, '');
  }

  private invalid() { return codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_IDENTITY_INVALID', 'Provider identity response is invalid'); }
}
