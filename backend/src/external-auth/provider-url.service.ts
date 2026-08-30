import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { codedHttpException } from '../errors/coded-http.exception';

export interface SafeProviderAddress {
  address: string;
  family: 4 | 6;
}

@Injectable()
export class ProviderUrlService {
  constructor(private readonly config: ConfigService) {}

  async assertSafe(value: string): Promise<URL> {
    let url: URL;
    try { url = new URL(value); } catch { throw this.unsafe(); }
    if (url.username || url.password || url.hash) throw this.unsafe();
    const environment = this.config.get<string>('NODE_ENV') ?? 'development';
    const hostname = this.normalizeHostname(url.hostname);
    const localDevelopment = environment !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) throw this.unsafe();
    if (['169.254.169.254', 'fd00:ec2::254', 'metadata.google.internal', 'instance-data.ec2.internal', 'metadata.azure.internal'].includes(hostname)) throw this.unsafe();
    await this.resolveSafeAddresses(hostname);
    return url;
  }

  async resolveSafeAddresses(hostname: string): Promise<SafeProviderAddress[]> {
    const normalizedHostname = this.normalizeHostname(hostname);
    const literalFamily = isIP(normalizedHostname);
    const addresses = literalFamily
      ? [{ address: normalizedHostname, family: literalFamily }]
      : await this.lookupAddresses(normalizedHostname);
    if (!addresses.length || addresses.some(({ address, family }) => isIP(address) !== family)) throw this.dnsFailure();
    if (this.config.get<string>('NODE_ENV') === 'production' && addresses.some(({ address }) => this.isLoopbackOrLinkLocal(address))) throw this.unsafe();
    return addresses as SafeProviderAddress[];
  }

  private async lookupAddresses(hostname: string): Promise<Array<{ address: string; family: number }>> {
    return lookup(hostname, { all: true, verbatim: true }).catch(() => {
      throw this.dnsFailure();
    });
  }

  private isLoopbackOrLinkLocal(address: string): boolean {
    return address === '::1' || address.startsWith('127.') || address.startsWith('169.254.')
      || /^::ffff:127\./i.test(address) || /^fe[89ab]/i.test(address) || address.toLowerCase() === 'fd00:ec2::254';
  }

  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  }

  private unsafe() {
    return codedHttpException(HttpStatus.BAD_REQUEST, 'AUTH_PROVIDER_URL_UNSAFE', 'Provider URL is not allowed');
  }

  private dnsFailure() {
    return codedHttpException(HttpStatus.BAD_REQUEST, 'AUTH_PROVIDER_DNS_FAILED', 'Provider host could not be resolved');
  }
}
