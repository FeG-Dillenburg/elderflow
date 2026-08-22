import { Encoder } from 'cbor-x';
import { decodeKeyCeremonyPayload, encodeKeyCeremonyPayload } from './key-ceremony-payload';

describe('key ceremony candidate payload', () => {
  const candidate = {
    operation: 'replace_recovery_secret' as const,
    reasonCode: 'recovery_secret_lost',
    expectedGeneration: 7,
    orkId: '00000000-0000-4000-8000-000000000003',
    ockId: '00000000-0000-4000-8000-000000000004',
    ockEpoch: 2,
    sharedPassphraseSlot: Buffer.from('shared'),
    recoverySlot: Buffer.from('recovery'),
    contentKeyWrapper: Buffer.from('content'),
    custodyCopiesAcknowledged: 2 as const,
  };

  it('round-trips one canonical, versioned candidate without plaintext secrets', () => {
    const encoded = encodeKeyCeremonyPayload(candidate);

    expect(decodeKeyCeremonyPayload(encoded)).toEqual(candidate);
    expect(encoded.includes(Buffer.from('recovery_secret_lost'))).toBe(true);
    expect(encoded.includes(Buffer.from('EFR1.'))).toBe(false);
  });

  it('rejects a non-canonical or unknown operation candidate', () => {
    const nonCanonical = Buffer.from(new Encoder({ useRecords: true }).encode({ ...candidate }));
    expect(() => decodeKeyCeremonyPayload(nonCanonical)).toThrow('Invalid key ceremony candidate');

    const encoded = encodeKeyCeremonyPayload(candidate);
    const corrupted = Buffer.from(encoded);
    corrupted[0] = 0xff;
    expect(() => decodeKeyCeremonyPayload(corrupted)).toThrow('Invalid key ceremony candidate');
  });
});
