import { describe, expect, it } from 'vitest';
import {
  createRecoveryWrapper,
  createRecoveryCandidate,
  decodeRecoverySecret,
  derivePassphraseKeyInCurrentContext,
  encodeRecoverySecret,
  hkdfSha256,
  uuidToBytes,
  verifyRecoveryCandidate,
} from './crypto';

const hex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const toHex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

describe('Protected-text cryptographic boundary', () => {
  it('matches the published RFC 5869 SHA-256 test vector', async () => {
    const output = await hkdfSha256(
      hex('0b'.repeat(22)),
      hex('000102030405060708090a0b0c'),
      hex('f0f1f2f3f4f5f6f7f8f9'),
    );

    expect(toHex(output)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf');
  });

  it('reproduces the approved byte-exact recovery-wrapper composition vector', async () => {
    const result = await createRecoveryWrapper({
      organizationId: '00000000-0000-4000-8000-000000000001',
      slotId: '00000000-0000-4000-8000-000000000002',
      orkId: '00000000-0000-4000-8000-000000000003',
      recoverySecret: hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
      organizationRootKey: hex('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f'),
      nonce: hex('404142434445464748494a4b4c4d4e4f5051525354555657'),
    });

    expect(result.recoveryText).toBe('EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
    expect(toHex(result.derivedKey)).toBe('4efeeaaa44df51d51c43642c938a530ac620e1924bee325da7bab8d2037ba35e');
    expect(toHex(result.envelope)).toBe(
      '8601020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f505152535455565758309e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5f6',
    );
  });

  it('accepts only the canonical 256-bit Recovery Secret text form', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const encoded = encodeRecoverySecret(bytes);
    expect(decodeRecoverySecret(encoded)).toEqual(bytes);
    expect(() => decodeRecoverySecret(`${encoded}=`)).toThrow('E2EE_RECOVERY_SECRET_INVALID');
    expect(() => decodeRecoverySecret(` ${encoded}`)).toThrow('E2EE_RECOVERY_SECRET_INVALID');
    expect(() => decodeRecoverySecret(encoded.replace('EFR1.', 'EFR2.'))).toThrow('E2EE_RECOVERY_SECRET_INVALID');
  });

  it('encodes UUIDs as their 16 network-order bytes', () => {
    expect(toHex(uuidToBytes('00000000-0000-4000-8000-000000000001'))).toBe('00000000000040008000000000000001');
  });

  it('lets a second browser verify the exact recovery candidate without sending the Recovery Secret', async () => {
    const state = {
      envelopeFormat: 1 as const,
      cryptoSuite: 1 as const,
      passphraseKdf: { version: 1 as const, operationsLimit: 3 as const, memoryLimit: 67_108_864 as const, outputLength: 32 as const },
      organizationId: '00000000-0000-4000-8000-000000000001',
      generation: 1,
      orkId: '00000000-0000-4000-8000-000000000003',
      ockId: '00000000-0000-4000-8000-000000000004',
      ockEpoch: 1,
      sharedPassphraseSlot: '',
      contentKeyWrapper: '',
      recoverySlot: Buffer.from(
        '8601020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f505152535455565758309e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5f6',
        'hex',
      ).toString('base64url'),
    };
    const recoveryText = 'EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    const candidate = await createRecoveryCandidate(recoveryText, 'new shared passphrase', state, undefined, derivePassphraseKeyInCurrentContext);

    await expect(verifyRecoveryCandidate(recoveryText, 'new shared passphrase', state, candidate, undefined, derivePassphraseKeyInCurrentContext)).resolves.toBe(true);
    await expect(verifyRecoveryCandidate(recoveryText, 'wrong candidate passphrase', state, candidate, undefined, derivePassphraseKeyInCurrentContext)).resolves.toBe(false);
  }, 30_000);
});
