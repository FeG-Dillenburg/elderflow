import { HttpStatus } from '@nestjs/common';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
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
      codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_CONNECTION_FAILED', 'sensitive provider response', {
        ignored: 'sensitive detail',
        networkCode: 'ECONNREFUSED',
        resolvedAddress: '203.0.113.8',
        resolvedFamily: 4,
      }),
    );

    await expect(service.postForm('https://user:password@provider.example/token?code=secret', new URLSearchParams(), undefined, 'token'))
      .rejects.toMatchObject({
        response: {
          code: 'AUTH_PROVIDER_TOKEN_CONNECTION_FAILED',
          params: {
            endpoint: 'https://provider.example/token',
            method: 'POST',
            networkCode: 'ECONNREFUSED',
            resolvedAddress: '203.0.113.8',
            resolvedFamily: 4,
            stage: 'token',
          },
        },
      });
  });

  it('retains a safe HTTP status while discarding the provider response body', async () => {
    const service = new ProviderHttpService({ assertSafe: jest.fn(async (url: string) => new URL(url)) } as any);
    jest.spyOn(service as any, 'request').mockResolvedValue({ status: 401, body: 'sensitive provider response' });

    await expect(service.postForm('https://provider.example/token', new URLSearchParams(), undefined, 'token'))
      .rejects.toMatchObject({
        response: {
          code: 'AUTH_PROVIDER_TOKEN_HTTP_401',
          params: {
            endpoint: 'https://provider.example/token',
            httpStatus: 401,
            method: 'POST',
            stage: 'token',
          },
        },
      });
  });

  it('supports Node HTTP requests that ask the custom lookup for all addresses', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const addresses = [{ address: '127.0.0.1', family: 4 }];
    const service = new ProviderHttpService({
      assertSafe: jest.fn(async (url: string) => new URL(url)),
      resolveSafeAddresses: jest.fn(async () => addresses),
    } as any);

    try {
      await expect(service.getJson(`http://provider.test:${port}/userinfo`)).resolves.toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
