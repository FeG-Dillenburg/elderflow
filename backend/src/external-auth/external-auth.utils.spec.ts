import { configurationFingerprint, normalizeEmail, safeReturnPath } from './external-auth.utils';

describe('External authentication primitives', () => {
  it('normalizes email only for exact linking comparisons', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('binds test approval to connection-sensitive fields but not the display label', () => {
    const base = {
      type: 'oidc' as const,
      issuerUrl: 'https://identity.example.com',
      churchToolsUrl: null,
      clientId: 'elderflow',
      publicBaseUrl: 'https://elderflow.example.com',
      clientSecretEnvelope: 'v1.secret',
    };
    expect(configurationFingerprint(base)).toBe(configurationFingerprint({ ...base }));
    expect(configurationFingerprint(base)).not.toBe(configurationFingerprint({ ...base, publicBaseUrl: 'https://other.example.com' }));
  });

  it('accepts only local relative return paths', () => {
    expect(safeReturnPath('/meetings/42?tab=agenda')).toBe('/meetings/42?tab=agenda');
    for (const unsafe of ['https://evil.example', '//evil.example', '/%2f%2fevil.example', 'meetings', '\\evil']) {
      expect(safeReturnPath(unsafe)).toBe('/');
    }
  });
});
