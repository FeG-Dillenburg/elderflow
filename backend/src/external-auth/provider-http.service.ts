import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { codedHttpException } from '../errors/coded-http.exception';
import { ProviderUrlService } from './provider-url.service';

export type ProviderRequestStage = 'discovery' | 'jwks' | 'token' | 'userinfo';

export interface ProviderRequestDiagnostic {
  endpoint?: string;
  httpStatus?: number;
  method?: 'GET' | 'POST';
  networkCode?: string;
  resolvedAddress?: string;
  resolvedFamily?: 4 | 6;
  stage?: ProviderRequestStage;
}

const stagedFailureCodes = new Set([
  'AUTH_PROVIDER_CONNECTION_FAILED',
  'AUTH_PROVIDER_DNS_FAILED',
  'AUTH_PROVIDER_RESPONSE_INVALID',
  'AUTH_PROVIDER_RESPONSE_TOO_LARGE',
  'AUTH_PROVIDER_TIMEOUT',
  'AUTH_PROVIDER_TLS_FAILED',
]);

const isStagedFailureCode = (code: string): boolean => stagedFailureCodes.has(code)
  || /^AUTH_PROVIDER_HTTP_[1-5][0-9]{2}$/.test(code);

const safeEndpoint = (url: string | URL): string | undefined => {
  try {
    const parsed = typeof url === 'string' ? new URL(url) : url;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
};

const safeNetworkCode = (error: unknown): string | undefined => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code.toUpperCase()
    : error instanceof Error && /^AUTH_PROVIDER_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : undefined;
  return code && /^[A-Z0-9_]+$/.test(code) ? code : undefined;
};

export function providerNetworkFailureCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code.toUpperCase()
    : '';
  const message = error instanceof Error ? error.message.toUpperCase() : '';
  if (message === 'AUTH_PROVIDER_RESPONSE_TOO_LARGE') return 'AUTH_PROVIDER_RESPONSE_TOO_LARGE';
  if (message === 'AUTH_PROVIDER_TIMEOUT' || ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) return 'AUTH_PROVIDER_TIMEOUT';
  if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code)) return 'AUTH_PROVIDER_DNS_FAILED';
  if (code.startsWith('CERT_') || code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || [
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ].includes(code)) return 'AUTH_PROVIDER_TLS_FAILED';
  return 'AUTH_PROVIDER_CONNECTION_FAILED';
}

@Injectable()
export class ProviderHttpService {
  constructor(private readonly urls: ProviderUrlService) {}

  async getJson(url: string, authorization?: string, stage?: ProviderRequestStage): Promise<Record<string, unknown>> {
    return this.withStage(stage, url, 'GET', () => this.requestJson(url, { headers: authorization ? { Authorization: authorization } : undefined }));
  }

  async postForm(url: string, form: URLSearchParams, authorization?: string, stage?: ProviderRequestStage): Promise<Record<string, unknown>> {
    return this.withStage(stage, url, 'POST', () => this.requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: form,
    }));
  }

  private async requestJson(url: string, init: RequestInit, redirects = 0): Promise<Record<string, unknown>> {
    const parsed = await this.urls.assertSafe(url);
    const response = await this.request(parsed, init);
    if (response.status >= 300 && response.status < 400 && response.location && redirects < 3) {
      const redirected = new URL(response.location, url);
      const sameOrigin = redirected.origin === parsed.origin;
      const preserveMethod = [307, 308].includes(response.status);
      const next: RequestInit = preserveMethod ? { ...init } : { method: 'GET', headers: init.headers };
      const headers = new Headers(next.headers);
      if (!sameOrigin && (init.body || headers.has('Authorization'))) {
        throw codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'Provider redirected sensitive authentication data to another origin', {
          endpoint: safeEndpoint(parsed),
          method: (init.method ?? 'GET').toUpperCase(),
        });
      }
      if (!sameOrigin) headers.delete('Authorization');
      next.headers = Object.fromEntries(headers.entries());
      if (!preserveMethod) delete next.body;
      return this.requestJson(redirected.toString(), next, redirects + 1);
    }
    if (response.status < 200 || response.status >= 300) {
      throw codedHttpException(HttpStatus.BAD_GATEWAY, `AUTH_PROVIDER_HTTP_${response.status}`, 'External login provider returned an unsuccessful response', {
        endpoint: safeEndpoint(parsed),
        httpStatus: response.status,
        method: (init.method ?? 'GET').toUpperCase(),
      });
    }
    try { return JSON.parse(response.body) as Record<string, unknown>; } catch {
      throw codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'External login provider returned an invalid response', {
        endpoint: safeEndpoint(parsed),
        method: (init.method ?? 'GET').toUpperCase(),
      });
    }
  }

  private request(url: URL, init: RequestInit): Promise<{ status: number; location?: string; body: string }> {
    return new Promise((resolve, reject) => {
      const body = init.body instanceof URLSearchParams ? init.body.toString() : typeof init.body === 'string' ? init.body : undefined;
      let resolvedAddress: string | undefined;
      let resolvedFamily: 4 | 6 | undefined;
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string> | undefined,
        lookup: (hostname, _options, callback) => {
          void this.urls.resolveSafeAddress(hostname)
            .then(({ address, family }) => {
              resolvedAddress = address;
              resolvedFamily = family === 4 || family === 6 ? family : undefined;
              callback(null, address, family);
            })
            .catch((error) => callback(error as Error, '', 0));
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024 * 1024) request.destroy(new Error('AUTH_PROVIDER_RESPONSE_TOO_LARGE'));
          else chunks.push(chunk);
        });
        response.on('end', () => resolve({
          status: response.statusCode ?? 500,
          location: response.headers.location,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.setTimeout(10_000, () => request.destroy(new Error('AUTH_PROVIDER_TIMEOUT')));
      request.on('error', (error) => {
        if (error instanceof HttpException) {
          reject(error);
          return;
        }
        const networkCode = safeNetworkCode(error);
        reject(codedHttpException(HttpStatus.BAD_GATEWAY, providerNetworkFailureCode(error), 'External login provider request failed', {
          endpoint: safeEndpoint(url),
          method: (init.method ?? 'GET').toUpperCase(),
          ...(networkCode ? { networkCode } : {}),
          ...(resolvedAddress ? { resolvedAddress } : {}),
          ...(resolvedFamily ? { resolvedFamily } : {}),
        }));
      });
      if (body) request.write(body);
      request.end();
    });
  }

  private async withStage(
    stage: ProviderRequestStage | undefined,
    url: string,
    method: 'GET' | 'POST',
    request: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    try {
      return await request();
    } catch (error) {
      const code = this.errorCode(error);
      if (!stage || !code || !isStagedFailureCode(code)) throw error;
      const stagedCode = `AUTH_PROVIDER_${stage.toUpperCase()}_${code.slice('AUTH_PROVIDER_'.length)}`;
      throw codedHttpException(HttpStatus.BAD_GATEWAY, stagedCode, 'External login provider request failed', {
        endpoint: safeEndpoint(url),
        method,
        ...this.diagnosticParams(error),
        stage,
      });
    }
  }

  private errorCode(error: unknown): string | null {
    if (!(error instanceof HttpException)) return null;
    const response = error.getResponse();
    return typeof response === 'object' && response && 'code' in response && typeof response.code === 'string'
      ? response.code
      : null;
  }

  private diagnosticParams(error: unknown): ProviderRequestDiagnostic {
    if (!(error instanceof HttpException)) return {};
    const response = error.getResponse();
    if (!response || typeof response !== 'object' || !('params' in response) || !response.params || typeof response.params !== 'object') return {};
    const params = response.params as Record<string, unknown>;
    const endpoint = typeof params.endpoint === 'string' ? safeEndpoint(params.endpoint) : undefined;
    return {
      ...(endpoint ? { endpoint } : {}),
      ...(Number.isInteger(params.httpStatus) && Number(params.httpStatus) >= 100 && Number(params.httpStatus) <= 599 ? { httpStatus: Number(params.httpStatus) } : {}),
      ...(params.method === 'GET' || params.method === 'POST' ? { method: params.method } : {}),
      ...(typeof params.networkCode === 'string' && /^[A-Z0-9_]+$/.test(params.networkCode) ? { networkCode: params.networkCode } : {}),
      ...(typeof params.resolvedAddress === 'string' ? { resolvedAddress: params.resolvedAddress } : {}),
      ...(params.resolvedFamily === 4 || params.resolvedFamily === 6 ? { resolvedFamily: params.resolvedFamily } : {}),
    };
  }
}
