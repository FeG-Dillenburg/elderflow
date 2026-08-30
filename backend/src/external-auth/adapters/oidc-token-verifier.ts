import { createPublicKey, constants, verify } from 'node:crypto';
import type { JsonWebKey as NodeJsonWebKey } from 'node:crypto';

interface JwtHeader { alg?: string; kid?: string }
interface JwtClaims extends Record<string, unknown> { iss?: string; aud?: string | string[]; sub?: string; exp?: number; nbf?: number; iat?: number; nonce?: string }

const algorithms: Record<string, { digest: string; padding?: number; dsaEncoding?: 'ieee-p1363' }> = {
  RS256: { digest: 'RSA-SHA256' }, RS384: { digest: 'RSA-SHA384' }, RS512: { digest: 'RSA-SHA512' },
  PS256: { digest: 'RSA-SHA256', padding: constants.RSA_PKCS1_PSS_PADDING },
  PS384: { digest: 'RSA-SHA384', padding: constants.RSA_PKCS1_PSS_PADDING },
  PS512: { digest: 'RSA-SHA512', padding: constants.RSA_PKCS1_PSS_PADDING },
  ES256: { digest: 'SHA256', dsaEncoding: 'ieee-p1363' }, ES384: { digest: 'SHA384', dsaEncoding: 'ieee-p1363' }, ES512: { digest: 'SHA512', dsaEncoding: 'ieee-p1363' },
};

export function verifyOidcIdToken(input: {
  token: string;
  jwks: { keys?: Array<NodeJsonWebKey & { kid?: string }> };
  issuer: string;
  clientId: string;
  nonce: string;
  supportedAlgorithms?: string[];
  now?: number;
}): JwtClaims {
  const parts = input.token.split('.');
  if (parts.length !== 3) throw new Error('AUTH_PROVIDER_TOKEN_INVALID');
  let header: JwtHeader;
  let claims: JwtClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw new Error('AUTH_PROVIDER_TOKEN_INVALID'); }
  const algorithm = header.alg ? algorithms[header.alg] : undefined;
  if (!algorithm || input.supportedAlgorithms && !input.supportedAlgorithms.includes(header.alg!)) throw new Error('AUTH_PROVIDER_TOKEN_INVALID');
  const keys = input.jwks.keys ?? [];
  const jwk = header.kid ? keys.find((candidate) => candidate.kid === header.kid) : keys.length === 1 ? keys[0] : undefined;
  if (!jwk) throw new Error('AUTH_PROVIDER_TOKEN_INVALID');
  let valid = false;
  try {
    valid = verify(algorithm.digest, Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: createPublicKey({ key: jwk, format: 'jwk' }),
      ...(algorithm.padding ? { padding: algorithm.padding } : {}),
      ...(algorithm.dsaEncoding ? { dsaEncoding: algorithm.dsaEncoding } : {}),
    }, Buffer.from(parts[2], 'base64url'));
  } catch { throw new Error('AUTH_PROVIDER_TOKEN_INVALID'); }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== input.issuer || !audiences.includes(input.clientId) || !claims.sub || claims.nonce !== input.nonce
    || audiences.length > 1 && claims.azp !== input.clientId
    || typeof claims.exp !== 'number' || claims.exp <= now - 60 || typeof claims.iat !== 'number' || claims.iat > now + 60
    || typeof claims.nbf === 'number' && claims.nbf > now + 60) throw new Error('AUTH_PROVIDER_TOKEN_INVALID');
  return claims;
}
