import { HttpStatus, Injectable } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { codedHttpException } from '../errors/coded-http.exception';
import { ProviderUrlService } from './provider-url.service';

@Injectable()
export class ProviderHttpService {
  constructor(private readonly urls: ProviderUrlService) {}

  async getJson(url: string, authorization?: string): Promise<Record<string, unknown>> {
    return this.requestJson(url, { headers: authorization ? { Authorization: authorization } : undefined });
  }

  async postForm(url: string, form: URLSearchParams, authorization?: string): Promise<Record<string, unknown>> {
    return this.requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: form,
    });
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
        throw codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'Provider redirected sensitive authentication data to another origin');
      }
      if (!sameOrigin) headers.delete('Authorization');
      next.headers = Object.fromEntries(headers.entries());
      if (!preserveMethod) delete next.body;
      return this.requestJson(redirected.toString(), next, redirects + 1);
    }
    if (response.status < 200 || response.status >= 300) throw codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'External login provider returned an invalid response');
    try { return JSON.parse(response.body) as Record<string, unknown>; } catch {
      throw codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_RESPONSE_INVALID', 'External login provider returned an invalid response');
    }
  }

  private request(url: URL, init: RequestInit): Promise<{ status: number; location?: string; body: string }> {
    return new Promise((resolve, reject) => {
      const body = init.body instanceof URLSearchParams ? init.body.toString() : typeof init.body === 'string' ? init.body : undefined;
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string> | undefined,
        lookup: (hostname, _options, callback) => {
          void this.urls.resolveSafeAddress(hostname)
            .then(({ address, family }) => callback(null, address, family))
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
      request.on('error', () => reject(codedHttpException(HttpStatus.BAD_GATEWAY, 'AUTH_PROVIDER_UNAVAILABLE', 'External login provider is unavailable')));
      if (body) request.write(body);
      request.end();
    });
  }
}
