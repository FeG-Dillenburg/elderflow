import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { SaveExternalProviderDto } from './dto/external-auth.dto';
import { ExternalAuthProvider } from './external-auth-provider.entity';
import { configurationFingerprint } from './external-auth.utils';
import { ExternalIdentity } from './external-identity.entity';
import { ProviderSecretService } from './provider-secret.service';
import { ProviderSettingsService } from './provider-settings.service';

// In-memory repository boundary; settings and encryption use their real implementations.
function fixture(type: 'churchtools' | 'oidc' = 'churchtools') {
  let stored: ExternalAuthProvider | null = null;
  const query = {
    where: () => query,
    addSelect: () => query,
    getOne: async () => stored ? { ...stored } : null,
  };
  const providers = {
    create: (value: Partial<ExternalAuthProvider>) => ({ id: 'provider-id', ...value }),
    createQueryBuilder: () => query,
    save: async (value: ExternalAuthProvider) => { stored = { ...value }; return { ...value }; },
  } as unknown as Repository<ExternalAuthProvider>;
  const key = Buffer.alloc(32, 7).toString('base64url');
  const service = (deploymentKey: string | undefined = key) => {
    const config = new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: deploymentKey, NODE_ENV: 'test' });
    return new ProviderSettingsService(providers, {} as Repository<ExternalIdentity>, {} as Repository<User>, new ProviderSecretService(config), config);
  };
  const input: SaveExternalProviderDto = {
    type, displayLabel: 'External login', churchToolsUrl: 'https://example.church.tools',
    issuerUrl: 'https://identity.example.com', clientId: 'client', publicBaseUrl: 'https://elderflow.example.com',
  };
  return { service, input, providers, secrets: new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: key })) };
}

describe.each(['churchtools', 'oidc'] as const)('%s provider settings secrets', (type) => {
  it('encrypts secrets, exposes only configured status, and preserves, replaces, and removes them explicitly', async () => {
    const { service, input, secrets } = fixture(type);
    const settings = service();
    const saved = await settings.save({ ...input, clientSecret: 'first-secret' });
    expect(saved.clientSecretConfigured).toBe(true);
    expect(saved).not.toHaveProperty('clientSecret');
    expect(saved).not.toHaveProperty('clientSecretEnvelope');
    const original = (await settings.requireCurrent(true)).clientSecretEnvelope!;
    expect(original).not.toContain('first-secret');
    expect(secrets.decrypt(original)).toBe('first-secret');
    await settings.save({ ...input, displayLabel: 'Renamed' });
    expect((await settings.requireCurrent(true)).clientSecretEnvelope).toBe(original);
    await settings.save({ ...input, clientSecret: '' });
    expect((await settings.requireCurrent(true)).clientSecretEnvelope).toBe(original);
    await settings.save({ ...input, clientSecret: 'replacement-secret' });
    expect(secrets.decrypt((await settings.requireCurrent(true)).clientSecretEnvelope!)).toBe('replacement-secret');
    await settings.save({ ...input, removeClientSecret: true });
    expect((await settings.getSettings())?.clientSecretConfigured).toBe(false);
    expect((await settings.requireCurrent(true)).clientSecretEnvelope).toBeNull();
  });

  it.each([
    ['', 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE'],
    ['invalid', 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE'],
    [Buffer.alloc(32, 9).toString('base64url'), 'AUTH_PROVIDER_SECRET_DECRYPT_FAILED'],
  ])('hides secret-dependent login with an unavailable or incorrect key', async (key, code) => {
    const { service, input, providers } = fixture(type);
    const settings = service();
    await settings.save({ ...input, clientSecret: 'saved-secret' });
    const provider = await settings.requireCurrent(true);
    provider.testedFingerprint = configurationFingerprint(provider);
    provider.testedAt = new Date();
    provider.enabled = true;
    await providers.save(provider);
    expect(await settings.getPublicProvider()).not.toBeNull();
    const unavailable = service(key);
    expect((await unavailable.getSettings())?.diagnosticCode).toBe(code);
    expect((await unavailable.getSettings())?.canEnable).toBe(false);
    expect(await unavailable.getPublicProvider()).toBeNull();
    await expect(unavailable.setEnabled(true)).rejects.toThrow('A successful provider test is required');
    if (code === 'AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE') {
      await expect(unavailable.save({ ...input, clientSecret: 'replacement' })).rejects.toThrow('Provider secret key is unavailable');
    }
    await unavailable.save({ ...input, removeClientSecret: true });
    expect((await unavailable.getSettings())?.diagnosticCode).toBeNull();
  });

  it('keeps legacy clients usable without a deployment key and invalidates approval on secret changes', async () => {
    const { service, input, providers } = fixture(type);
    const settings = service();
    await settings.save(input);
    const provider = await settings.requireCurrent(true);
    provider.testedFingerprint = configurationFingerprint(provider);
    provider.testedAt = new Date();
    provider.enabled = true;
    await providers.save(provider);
    expect(await service('').getPublicProvider()).not.toBeNull();
    const changed = await settings.save({ ...input, clientSecret: 'new-secret' });
    expect(changed).toMatchObject({ enabled: false, testedAt: null, canEnable: false, status: 'draft' });
  });
});
