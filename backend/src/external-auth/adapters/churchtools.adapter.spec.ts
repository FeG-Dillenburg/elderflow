import { ConfigService } from '@nestjs/config';
import { ProviderSecretService } from '../provider-secret.service';
import { ChurchToolsAdapter } from './churchtools.adapter';
import contract from './fixtures/churchtools-userinfo.contract.json';

describe('ChurchToolsAdapter contract', () => {
  const http = { postForm: jest.fn(), getJson: jest.fn() };
  const urls = { assertSafe: jest.fn() };
  const secrets = new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: Buffer.alloc(32, 7).toString('base64url') }));
  const adapter = new ChurchToolsAdapter(http as any, urls as any, secrets);
  const provider = { churchToolsUrl: 'https://example.church.tools', clientId: 'client-id', publicBaseUrl: 'https://elderflow.example.com' } as any;
  const transaction = { codeVerifier: 'verifier' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('uses the documented endpoints, sends no scope, secret, or unpaired PKCE verifier, and treats id as the stable subject', async () => {
    http.postForm.mockResolvedValue({ access_token: 'transient-token', token_type: 'Bearer' });
    http.getJson.mockResolvedValue(contract.response);

    await expect(adapter.exchange(provider, transaction, { code: 'authorization-code' })).resolves.toEqual({
      subject: '4711', email: 'user@example.com',
    });
    const form = http.postForm.mock.calls[0][1] as URLSearchParams;
    expect(http.postForm.mock.calls[0][0]).toBe('https://example.church.tools/oauth/access_token');
    expect(http.postForm).toHaveBeenCalledWith(
      'https://example.church.tools/oauth/access_token',
      expect.any(URLSearchParams),
      undefined,
      'token',
    );
    expect(http.getJson).toHaveBeenCalledWith('https://example.church.tools/oauth/userinfo', 'Bearer transient-token', 'userinfo');
    expect(form.has('scope')).toBe(false);
    expect(form.has('client_secret')).toBe(false);
    expect(form.has('code_verifier')).toBe(false);
  });

  it('sends the decrypted secret only in the token form, preserving the authorization-code contract', async () => {
    const configured = { ...provider, clientSecretEnvelope: secrets.encrypt('generated+secret&value') };
    http.postForm.mockResolvedValue({ access_token: 'transient-token' });
    http.getJson.mockResolvedValue(contract.response);

    const authorization = new URL(await adapter.createAuthorizationUrl(configured, transaction, 'state'));
    expect(Object.fromEntries(authorization.searchParams)).toEqual({
      response_type: 'code', client_id: 'client-id',
      redirect_uri: 'https://elderflow.example.com/api/auth/external/callback', state: 'state',
    });
    await adapter.exchange(configured, transaction, { code: 'fresh-code' });
    expect(Object.fromEntries(http.postForm.mock.calls[0][1])).toEqual({
      grant_type: 'authorization_code', code: 'fresh-code', client_id: 'client-id',
      redirect_uri: 'https://elderflow.example.com/api/auth/external/callback',
      client_secret: 'generated+secret&value',
    });
  });

  it.each([
    ['', 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE'],
    ['invalid', 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE'],
    [Buffer.alloc(32, 9).toString('base64url'), 'AUTH_PROVIDER_SECRET_DECRYPT_FAILED'],
  ])('fails safely before calling the provider when its secret cannot be decrypted', async (key, code) => {
    const unavailable = new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: key }));
    const configured = { ...provider, clientSecretEnvelope: secrets.encrypt('private-secret') };
    const adapterWithUnavailableKey = new ChurchToolsAdapter(http as any, urls as any, unavailable);
    await expect(adapterWithUnavailableKey.exchange(configured, transaction, { code: 'code' })).rejects.toThrow(code);
    expect(http.postForm).not.toHaveBeenCalled();
    expect(http.getJson).not.toHaveBeenCalled();
  });

  it('prefers root identity fields over the duplicated data object', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({
      ...contract.response,
      id: 815,
      email: 'root@example.com',
      data: { ...contract.response.data, id: 4711, email: 'nested@example.com' },
    });

    await expect(adapter.exchange(provider, transaction, { code: 'code' })).resolves.toEqual({
      subject: '815', email: 'root@example.com',
    });
  });

  it('falls back to the data object when root identity fields are missing or invalid', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({ id: null, email: '', data: contract.response.data });

    await expect(adapter.exchange(provider, transaction, { code: 'code' })).resolves.toEqual({
      subject: '4711', email: 'user@example.com',
    });
  });

  it('rejects email-only profiles because email is not a stable identity', async () => {
    http.postForm.mockResolvedValue({ access_token: 'token' });
    http.getJson.mockResolvedValue({ email: 'user@example.com', data: { email: 'nested@example.com' } });
    await expect(adapter.exchange(provider, transaction, { code: 'code' })).rejects.toThrow('Provider identity response is invalid');
  });
});
