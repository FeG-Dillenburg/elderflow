import { describe, expect, it } from 'vitest';
import { decodeKeyCeremonyPayload, encodeKeyCeremonyPayload } from './key-ceremony-payload';

describe('key ceremony candidate payload', () => {
  it('encodes the canonical binary contract accepted by the backend', () => {
    const candidate = {
      operation: 'change_passphrase' as const,
      reasonCode: 'team_member_left',
      expectedGeneration: 3,
      orkId: '00000000-0000-4000-8000-000000000003',
      ockId: '00000000-0000-4000-8000-000000000004',
      ockEpoch: 1,
      sharedPassphraseSlot: 'c2hhcmVk',
      recoverySlot: 'cmVjb3Zlcnk',
      contentKeyWrapper: 'Y29udGVudA',
      custodyCopiesAcknowledged: 0 as const,
    };

    const encoded = encodeKeyCeremonyPayload(candidate);

    expect(decodeKeyCeremonyPayload(encoded)).toEqual(candidate);
    expect(new TextDecoder().decode(encoded)).not.toContain('EFR1.');
  });
});
