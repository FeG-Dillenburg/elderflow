import { generateKeyPairSync, sign } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { verifyOidcIdToken } from './oidc-token-verifier';

describe('OIDC ID token verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' } as JsonWebKey & { kid: string };
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (claims: Record<string, unknown>) => {
    const unsigned = `${encoded({ alg: 'RS256', kid: 'test-key' })}.${encoded(claims)}`;
    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
  };
  const valid = { iss: 'https://issuer.example', aud: 'client', sub: 'subject', nonce: 'nonce', iat: 1_000, exp: 2_000 };

  it('validates signature, issuer, audience, time, subject, and nonce', () => {
    expect(verifyOidcIdToken({ token: token(valid), jwks: { keys: [jwk] }, issuer: valid.iss, clientId: valid.aud, nonce: valid.nonce, now: 1_100 }).sub).toBe('subject');
  });

  it.each([
    ['issuer', { ...valid, iss: 'https://attacker.example' }],
    ['audience', { ...valid, aud: 'other-client' }],
    ['nonce', { ...valid, nonce: 'other' }],
    ['expiry', { ...valid, exp: 1_000 }],
  ])('rejects an invalid %s', (_name, claims) => {
    expect(() => verifyOidcIdToken({ token: token(claims), jwks: { keys: [jwk] }, issuer: valid.iss, clientId: valid.aud, nonce: valid.nonce, now: 1_100 })).toThrow('AUTH_PROVIDER_TOKEN_INVALID');
  });
});
