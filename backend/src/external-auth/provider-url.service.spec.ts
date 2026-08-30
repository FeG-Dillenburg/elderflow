import { ConfigService } from '@nestjs/config';
import { ProviderUrlService } from './provider-url.service';

describe('ProviderUrlService', () => {
  it('allows deliberate private-LAN HTTPS providers while rejecting loopback, link-local, metadata, credentials, and plaintext in production', async () => {
    const service = new ProviderUrlService(new ConfigService({ NODE_ENV: 'production' }));
    await expect(service.assertSafe('https://10.20.30.40/oidc')).resolves.toBeInstanceOf(URL);
    await expect(service.assertSafe('https://127.0.0.1/oidc')).rejects.toThrow('Provider URL is not allowed');
    await expect(service.assertSafe('https://169.254.169.254/latest')).rejects.toThrow('Provider URL is not allowed');
    await expect(service.assertSafe('http://10.20.30.40/oidc')).rejects.toThrow('Provider URL is not allowed');
    await expect(service.assertSafe('https://user:secret@10.20.30.40/oidc')).rejects.toThrow('Provider URL is not allowed');
  });

  it('allows localhost HTTP only outside production', async () => {
    const service = new ProviderUrlService(new ConfigService({ NODE_ENV: 'test' }));
    await expect(service.assertSafe('http://127.0.0.1:8080/oidc')).resolves.toBeInstanceOf(URL);
  });
});
