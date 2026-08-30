import { HttpStatus, Injectable } from '@nestjs/common';
import type { JsonWebKey } from 'node:crypto';
import { codedHttpException } from '../../errors/coded-http.exception';
import { ExternalAuthProvider } from '../external-auth-provider.entity';
import { ExternalLoginTransaction } from '../external-login-transaction.entity';
import { ProviderHttpService } from '../provider-http.service';
import { ProviderSecretService } from '../provider-secret.service';
import { ProviderUrlService } from '../provider-url.service';
import { callbackUrl, ExternalCallback, ExternalIdentityResult, ProviderAdapter } from './provider-adapter';
import { verifyOidcIdToken } from './oidc-token-verifier';

interface Discovery extends Record<string, unknown> {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  userinfo_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
}

@Injectable()
export class OidcAdapter implements ProviderAdapter {
  constructor(private readonly http: ProviderHttpService, private readonly urls: ProviderUrlService, private readonly secrets: ProviderSecretService) {}

  async createAuthorizationUrl(provider: ExternalAuthProvider, transaction: ExternalLoginTransaction, state: string): Promise<string> {
    const discovery = await this.discovery(provider);
    await this.urls.assertSafe(discovery.authorization_endpoint!);
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(transaction.codeVerifier))).toString('base64url');
    const url = new URL(discovery.authorization_endpoint!);
    url.search = new URLSearchParams({ response_type: 'code', client_id: provider.clientId!, redirect_uri: callbackUrl(provider), scope: 'openid email', state, nonce: transaction.nonce!, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return url.toString();
  }

  async exchange(provider: ExternalAuthProvider, transaction: ExternalLoginTransaction, callback: ExternalCallback): Promise<ExternalIdentityResult> {
    const discovery = await this.discovery(provider);
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: callback.code, client_id: provider.clientId!, redirect_uri: callbackUrl(provider), code_verifier: transaction.codeVerifier });
    let authorization: string | undefined;
    if (provider.clientSecretEnvelope) {
      const secret = this.secrets.decrypt(provider.clientSecretEnvelope);
      const methods = discovery.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
      if (methods.includes('client_secret_basic')) authorization = `Basic ${Buffer.from(`${this.formEncode(provider.clientId!)}:${this.formEncode(secret)}`).toString('base64')}`;
      else if (methods.includes('client_secret_post')) form.set('client_secret', secret);
      else throw this.invalid('AUTH_PROVIDER_TOKEN_AUTH_UNSUPPORTED');
    } else if (discovery.token_endpoint_auth_methods_supported && !discovery.token_endpoint_auth_methods_supported.includes('none')) {
      throw this.invalid('AUTH_PROVIDER_TOKEN_AUTH_UNSUPPORTED');
    }
    const token = await this.http.postForm(discovery.token_endpoint!, form, authorization);
    if (typeof token.id_token !== 'string') throw this.invalid('AUTH_PROVIDER_TOKEN_INVALID');
    const jwks = await this.http.getJson(discovery.jwks_uri!);
    let claims: Record<string, unknown>;
    try {
      claims = verifyOidcIdToken({ token: token.id_token, jwks: jwks as { keys?: Array<JsonWebKey & { kid?: string }> }, issuer: provider.issuerUrl!, clientId: provider.clientId!, nonce: transaction.nonce!, supportedAlgorithms: discovery.id_token_signing_alg_values_supported });
    } catch { throw this.invalid('AUTH_PROVIDER_TOKEN_INVALID'); }
    let identity = claims;
    if (typeof identity.email !== 'string' || identity.email_verified !== true) {
      if (!discovery.userinfo_endpoint || typeof token.access_token !== 'string') throw this.invalid('AUTH_PROVIDER_EMAIL_UNVERIFIED');
      identity = await this.http.getJson(discovery.userinfo_endpoint, `Bearer ${token.access_token}`);
      if (identity.sub !== claims.sub) throw this.invalid('AUTH_PROVIDER_SUBJECT_MISMATCH');
    }
    if (typeof claims.sub !== 'string' || typeof identity.email !== 'string' || identity.email_verified !== true) throw this.invalid('AUTH_PROVIDER_EMAIL_UNVERIFIED');
    return { subject: claims.sub, email: identity.email };
  }

  private async discovery(provider: ExternalAuthProvider): Promise<Discovery> {
    if (!provider.issuerUrl || !provider.clientId || !provider.publicBaseUrl) throw new Error('AUTH_PROVIDER_CONFIGURATION_INCOMPLETE');
    await this.urls.assertSafe(provider.issuerUrl);
    const discoveryUrl = `${provider.issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const discovery = await this.http.getJson(discoveryUrl) as Discovery;
    if (discovery.issuer !== provider.issuerUrl || !discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.jwks_uri) throw this.invalid('AUTH_PROVIDER_DISCOVERY_INVALID');
    await Promise.all([discovery.token_endpoint, discovery.jwks_uri, discovery.userinfo_endpoint].filter(Boolean).map((url) => this.urls.assertSafe(url as string)));
    return discovery;
  }

  private invalid(code: string) { return codedHttpException(HttpStatus.BAD_GATEWAY, code, 'OpenID Connect response is invalid'); }

  private formEncode(value: string): string {
    return new URLSearchParams({ value }).toString().slice('value='.length);
  }
}
