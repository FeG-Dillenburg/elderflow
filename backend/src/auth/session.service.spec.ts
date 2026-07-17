import { UnauthorizedException } from '@nestjs/common';
import { SessionService } from './session.service';

describe('SessionService', () => {
  const config = { getOrThrow: jest.fn().mockReturnValue('a-secure-test-secret-that-is-long-enough') };
  const service = new SessionService(config as any);

  it('creates and verifies a signed, expiring session', () => {
    const token = service.create('user-id');
    expect(token.split('.')).toHaveLength(2);
    expect(service.verify(token)).toEqual(expect.objectContaining({ sub: 'user-id', exp: expect.any(Number) }));
  });

  it.each(['broken', 'payload.invalid-signature', 'payload.signature.extra'])('rejects invalid token %s', (token) => {
    expect(() => service.verify(token)).toThrow(UnauthorizedException);
  });

  it('rejects expired sessions', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const token = service.create('user-id');
    now.mockReturnValue(1_000_000 + 13 * 60 * 60 * 1000);
    expect(() => service.verify(token)).toThrow('Session expired');
    now.mockRestore();
  });
});
