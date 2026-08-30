import { HttpStatus } from '@nestjs/common';
import { codedHttpException } from '../errors/coded-http.exception';
import { ProviderHttpService, providerNetworkFailureCode } from './provider-http.service';

describe('ProviderHttpService diagnostics', () => {
  it.each([
    ['ENOTFOUND', 'AUTH_PROVIDER_DNS_FAILED'],
    ['EAI_AGAIN', 'AUTH_PROVIDER_DNS_FAILED'],
    ['CERT_HAS_EXPIRED', 'AUTH_PROVIDER_TLS_FAILED'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'AUTH_PROVIDER_TLS_FAILED'],
    ['ETIMEDOUT', 'AUTH_PROVIDER_TIMEOUT'],
    ['ECONNREFUSED', 'AUTH_PROVIDER_CONNECTION_FAILED'],
  ])('classifies %s without exposing the original error', (code, expected) => {
    expect(providerNetworkFailureCode(Object.assign(new Error('sensitive detail'), { code }))).toBe(expected);
  });

  it('preserves timeout and response-size guards as safe diagnostics', () => {
    expect(providerNetworkFailureCode(new Error('AUTH_PROVIDER_TIMEOUT'))).toBe('AUTH_PROVIDER_TIMEOUT');
    expect(providerNetworkFailureCode(new Error('AUTH_PROVIDER_RESPONSE_TOO_LARGE'))).toBe('AUTH_PROVIDER_RESPONSE_TOO_LARGE');
  });

  it('attaches the OAuth stage to a safe provider failure', async () => {
    const service = new ProviderHttpService({} as any);
    jest.spyOn(service as any, 'requestJson').mockRejectedValue(
      codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'sensitive provider response'),
    );

    await expect(service.postForm('https://provider.example/token', new URLSearchParams(), undefined, 'token'))
      .rejects.toMatchObject({ response: { code: 'AUTH_PROVIDER_TOKEN_RESPONSE_INVALID' } });
  });

  it('retains a safe HTTP status while discarding the provider response body', async () => {
    const service = new ProviderHttpService({ assertSafe: jest.fn(async (url: string) => new URL(url)) } as any);
    jest.spyOn(service as any, 'request').mockResolvedValue({ status: 401, body: 'sensitive provider response' });

    await expect(service.postForm('https://provider.example/token', new URLSearchParams(), undefined, 'token'))
      .rejects.toMatchObject({ response: { code: 'AUTH_PROVIDER_TOKEN_HTTP_401' } });
  });
});
