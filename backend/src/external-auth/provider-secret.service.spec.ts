import { ConfigService } from '@nestjs/config';
import { ProviderSecretService } from './provider-secret.service';

describe('ProviderSecretService', () => {
  const key = Buffer.alloc(32, 7).toString('base64url');

  it('round-trips a versioned authenticated envelope without exposing plaintext', () => {
    const service = new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: key }));
    const envelope = service.encrypt('provider-secret');

    expect(envelope).toMatch(/^v1\./);
    expect(envelope).not.toContain('provider-secret');
    expect(service.decrypt(envelope)).toBe('provider-secret');
  });

  it('rejects missing keys, wrong keys, and tampered envelopes without preventing construction', () => {
    const missing = new ProviderSecretService(new ConfigService({}));
    expect(missing.available).toBe(false);
    expect(() => missing.encrypt('secret')).toThrow('AUTH_PROVIDER_SECRET_KEY_UNAVAILABLE');

    const service = new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: key }));
    const wrong = new ProviderSecretService(new ConfigService({ AUTH_PROVIDER_SECRETS_KEY: Buffer.alloc(32, 8).toString('base64url') }));
    const envelope = service.encrypt('secret');
    expect(() => wrong.decrypt(envelope)).toThrow('AUTH_PROVIDER_SECRET_DECRYPT_FAILED');
    const parts = envelope.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    expect(() => service.decrypt(parts.join('.'))).toThrow('AUTH_PROVIDER_SECRET_DECRYPT_FAILED');
  });
});
