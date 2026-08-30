import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { codedHttpException } from '../errors/coded-http.exception';
import { User } from '../users/user.entity';
import { callbackUrl } from './adapters/provider-adapter';
import { SaveExternalProviderDto } from './dto/external-auth.dto';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { configurationFingerprint } from './external-auth.utils';
import { ExternalIdentity } from './external-identity.entity';
import { ProviderSecretService } from './provider-secret.service';

export interface ExternalProviderSettings {
  id: string;
  type: ExternalAuthProvider['type'];
  displayLabel: string;
  issuerUrl: string | null;
  churchToolsUrl: string | null;
  clientId: string | null;
  publicBaseUrl: string | null;
  callbackUrl: string | null;
  clientSecretConfigured: boolean;
  enabled: boolean;
  testedAt: Date | null;
  canEnable: boolean;
  status: 'draft' | 'tested-disabled' | 'enabled';
  diagnosticCode: string | null;
}

@Injectable()
export class ProviderSettingsService {
  constructor(
    @InjectRepository(ExternalAuthProvider) private readonly providers: Repository<ExternalAuthProvider>,
    @InjectRepository(ExternalIdentity) private readonly identities: Repository<ExternalIdentity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly secrets: ProviderSecretService,
    private readonly config: ConfigService,
  ) {}

  async getSettings(): Promise<ExternalProviderSettings | null> {
    const provider = await this.getCurrent(true);
    return provider ? this.present(provider) : null;
  }

  async getPublicProvider(): Promise<{ type: ExternalAuthProvider['type']; displayLabel: string } | null> {
    const provider = await this.getCurrent(true);
    if (!provider || !this.usable(provider)) return null;
    return { type: provider.type, displayLabel: provider.displayLabel };
  }

  async save(input: SaveExternalProviderDto): Promise<ExternalProviderSettings> {
    this.assertPublicBaseUrl(input.publicBaseUrl ?? null);
    let provider = await this.getCurrent(true);
    if (!provider) {
      provider = this.providers.create({
        type: input.type,
        displayLabel: input.displayLabel.trim(),
        issuerUrl: input.type === 'oidc' ? input.issuerUrl ?? null : null,
        churchToolsUrl: input.type === 'churchtools' ? input.churchToolsUrl?.replace(/\/$/, '') ?? null : null,
        clientId: input.clientId?.trim() || null,
        publicBaseUrl: input.publicBaseUrl?.replace(/\/$/, '') ?? null,
        clientSecretEnvelope: null,
        testedFingerprint: null,
        testedAt: null,
        enabled: false,
        diagnosticCode: null,
        removedAt: null,
      });
    } else {
      this.assertImmutable(provider, input);
      provider.displayLabel = input.displayLabel.trim();
      provider.issuerUrl = provider.type === 'oidc' ? provider.issuerUrl ?? input.issuerUrl ?? null : null;
      provider.churchToolsUrl = provider.type === 'churchtools' ? provider.churchToolsUrl ?? input.churchToolsUrl?.replace(/\/$/, '') ?? null : null;
      provider.clientId = provider.clientId ?? (input.clientId?.trim() || null);
      provider.publicBaseUrl = input.publicBaseUrl?.replace(/\/$/, '') ?? null;
    }
    if (input.type === 'oidc') {
      if (input.clientSecret !== undefined && input.clientSecret !== null && input.clientSecret !== '') {
        if (!this.secrets.available) throw codedHttpException(HttpStatus.SERVICE_UNAVAILABLE, 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE', 'Provider secret key is unavailable');
        provider.clientSecretEnvelope = this.secrets.encrypt(input.clientSecret);
      } else if (input.removeClientSecret) {
        provider.clientSecretEnvelope = null;
      }
    } else {
      provider.clientSecretEnvelope = null;
    }
    const previousFingerprint = provider.testedFingerprint;
    const nextFingerprint = configurationFingerprint(provider);
    if (previousFingerprint && previousFingerprint !== nextFingerprint) {
      provider.testedFingerprint = null;
      provider.testedAt = null;
      provider.enabled = false;
    }
    provider.diagnosticCode = this.secretDiagnostic(provider);
    return this.present(await this.providers.save(provider));
  }

  async setEnabled(enabled: boolean): Promise<ExternalProviderSettings> {
    const provider = await this.requireCurrent(true);
    if (enabled && (!this.configurationComplete(provider) || provider.testedFingerprint !== configurationFingerprint(provider) || this.secretDiagnostic(provider))) {
      throw codedHttpException(HttpStatus.CONFLICT, 'AUTH_PROVIDER_TEST_REQUIRED', 'A successful provider test is required');
    }
    provider.enabled = enabled;
    return this.present(await this.providers.save(provider));
  }

  async remove(): Promise<void> {
    const provider = await this.requireCurrent(true);
    provider.enabled = false;
    provider.clientSecretEnvelope = null;
    provider.publicBaseUrl = null;
    provider.testedFingerprint = null;
    provider.testedAt = null;
    provider.diagnosticCode = null;
    provider.removedAt = new Date();
    await this.providers.manager.transaction(async (manager) => {
      await manager.update(ExternalIdentity, { providerId: provider.id, active: true }, { active: false });
      await manager.save(ExternalAuthProvider, provider);
    });
  }

  async linkedUsers(): Promise<Array<{ id: string; email: string; firstName: string; lastName: string; linked: boolean }>> {
    const provider = await this.requireCurrent(false);
    const rows = await this.users.createQueryBuilder('user')
      .leftJoin(ExternalIdentity, 'identity', 'identity.user_id = user.id AND identity.provider_id = :providerId AND identity.active = true', { providerId: provider.id })
      .select(['user.id AS id', 'user.email AS email', 'user.first_name AS "firstName"', 'user.last_name AS "lastName"', '(identity.id IS NOT NULL) AS linked'])
      .where('user.archived_at IS NULL')
      .orderBy('user.last_name', 'ASC')
      .getRawMany();
    return rows.map((row) => ({ ...row, linked: row.linked === true || row.linked === 'true' }));
  }

  async getCurrent(includeSecret: boolean): Promise<ExternalAuthProvider | null> {
    const query = this.providers.createQueryBuilder('provider').where('provider.removed_at IS NULL');
    if (includeSecret) query.addSelect('provider.clientSecretEnvelope');
    return query.getOne();
  }

  async requireCurrent(includeSecret: boolean): Promise<ExternalAuthProvider> {
    const provider = await this.getCurrent(includeSecret);
    if (!provider) throw codedHttpException(HttpStatus.NOT_FOUND, 'AUTH_PROVIDER_NOT_CONFIGURED', 'External login provider is not configured');
    return provider;
  }

  present(provider: ExternalAuthProvider): ExternalProviderSettings {
    const approved = provider.testedFingerprint === configurationFingerprint(provider);
    const diagnosticCode = this.secretDiagnostic(provider) ?? provider.diagnosticCode;
    return {
      id: provider.id, type: provider.type, displayLabel: provider.displayLabel, issuerUrl: provider.issuerUrl,
      churchToolsUrl: provider.churchToolsUrl, clientId: provider.clientId, publicBaseUrl: provider.publicBaseUrl,
      callbackUrl: provider.publicBaseUrl ? callbackUrl(provider) : null,
      clientSecretConfigured: Boolean(provider.clientSecretEnvelope), enabled: provider.enabled,
      testedAt: approved ? provider.testedAt : null, canEnable: this.configurationComplete(provider) && approved && !diagnosticCode,
      status: provider.enabled ? 'enabled' : approved ? 'tested-disabled' : 'draft', diagnosticCode,
    };
  }

  usable(provider: ExternalAuthProvider): boolean {
    return provider.enabled && this.configurationComplete(provider) && provider.testedFingerprint === configurationFingerprint(provider) && !this.secretDiagnostic(provider);
  }

  private configurationComplete(provider: ExternalAuthProvider): boolean {
    return Boolean(provider.displayLabel && provider.clientId && provider.publicBaseUrl && (provider.type === 'oidc' ? provider.issuerUrl : provider.churchToolsUrl));
  }

  private secretDiagnostic(provider: ExternalAuthProvider): string | null {
    if (!provider.clientSecretEnvelope) return null;
    if (!this.secrets.available) return 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE';
    try { this.secrets.decrypt(provider.clientSecretEnvelope); return null; } catch { return 'AUTH_PROVIDER_SECRET_DECRYPT_FAILED'; }
  }

  private assertImmutable(provider: ExternalAuthProvider, input: SaveExternalProviderDto): void {
    const changed = provider.type !== input.type
      || provider.issuerUrl && input.issuerUrl !== undefined && provider.issuerUrl !== input.issuerUrl
      || provider.churchToolsUrl && input.churchToolsUrl !== undefined && provider.churchToolsUrl !== input.churchToolsUrl?.replace(/\/$/, '')
      || provider.clientId && input.clientId !== undefined && provider.clientId !== (input.clientId?.trim() || null);
    if (changed) throw codedHttpException(HttpStatus.CONFLICT, 'AUTH_PROVIDER_NAMESPACE_IMMUTABLE', 'Provider identity fields cannot be changed');
  }

  private assertPublicBaseUrl(value: string | null): void {
    if (!value) return;
    let url: URL;
    try { url = new URL(value); } catch { throw codedHttpException(HttpStatus.BAD_REQUEST, 'AUTH_PROVIDER_URL_UNSAFE', 'Public ElderFlow URL is not allowed'); }
    const developmentLocalhost = this.config.get<string>('NODE_ENV') !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      && url.protocol === 'http:';
    if (url.username || url.password || url.hash || url.search || url.pathname !== '/' || url.protocol !== 'https:' && !developmentLocalhost) {
      throw codedHttpException(HttpStatus.BAD_REQUEST, 'AUTH_PROVIDER_URL_UNSAFE', 'Public ElderFlow URL is not allowed');
    }
  }
}
