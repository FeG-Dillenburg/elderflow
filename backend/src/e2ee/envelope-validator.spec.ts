import { validateKeyEnvelope } from './envelope-validator';

const recoveryEnvelope = Buffer.from(
  '8601020185500000000000004000800000000000000150000000000000400080000000000000025000000000000040008000000000000003015818404142434445464748494a4b4c4d4e4f505152535455565758309e4a3fae295f66af9c81f2c90efa988a5c218fd4aa56aa21a49da288ac7a98e08cf8e552b54d9e67c869ee305d3f00b5f6',
  'hex',
);

describe('key-envelope validation boundary', () => {
  it('accepts the approved canonical recovery wrapper and extracts only public metadata', () => {
    expect(validateKeyEnvelope(recoveryEnvelope, 2)).toEqual({
      organizationId: '00000000-0000-4000-8000-000000000001',
      primaryKeyId: '00000000-0000-4000-8000-000000000002',
      wrappedKeyId: '00000000-0000-4000-8000-000000000003',
    });
  });

  it.each([
    Buffer.concat([recoveryEnvelope, Buffer.from([0])]),
    Buffer.from(recoveryEnvelope).fill(2, 0, 1),
    Buffer.from(recoveryEnvelope).subarray(0, recoveryEnvelope.length - 1),
  ])('rejects trailing, unsupported, or truncated bytes before persistence', (invalid) => {
    expect(() => validateKeyEnvelope(invalid, 2)).toThrow('E2EE_ENVELOPE_INVALID');
  });

  it('rejects a valid envelope at the wrong kind boundary', () => {
    expect(() => validateKeyEnvelope(recoveryEnvelope, 1)).toThrow('E2EE_ENVELOPE_INVALID');
  });
});
