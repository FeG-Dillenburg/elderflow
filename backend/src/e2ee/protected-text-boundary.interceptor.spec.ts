import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ProtectedTextBoundaryInterceptor } from './protected-text-boundary.interceptor';

describe('ProtectedTextBoundaryInterceptor', () => {
  const interceptor = new ProtectedTextBoundaryInterceptor();
  const context = (role: string, originalUrl = '/api/topics', overrides: Record<string, unknown> = {}) => ({
    switchToHttp: () => ({ getRequest: () => ({
      originalUrl,
      method: 'GET',
      user: { role },
      ...overrides,
    }) }),
  }) as any;

  it('leaves response projection to the encrypted endpoint contract', async () => {
    const result = await lastValueFrom(interceptor.intercept(context('user'), {
      handle: () => of({
        id: 'topic-id', type: 'general', status: 'open',
        protected: { nameEnvelope: 'opaque' },
      }),
    } as any));

    expect(result).toEqual({
      id: 'topic-id', type: 'general', status: 'open',
      protected: { nameEnvelope: 'opaque' },
    });
  });

  it('always rejects legacy plaintext writes while allowing structural-only mutations', () => {
    expect(() => interceptor.intercept(context('user', '/api/topics/id', {
      method: 'PUT', body: { name: 'Private name' },
    }), { handle: () => of(null) } as any)).toThrow(ForbiddenException);

    expect(() => interceptor.intercept(context('user', '/api/meetings/id/topics/order', {
      method: 'PUT', body: { items: [{ id: 'one', sectionId: 'two', position: 1 }] },
    }), { handle: () => of(null) } as any)).not.toThrow();
  });

  it('allows an encrypted Topic write with a structural membership signal', () => {
    expect(() => interceptor.intercept(context('user', '/api/topics', {
      method: 'POST',
      body: {
        id: 'topic-id',
        type: 'new_membership',
        status: 'open',
        membershipStatusSignal: 'new',
        protected: {
          nameEnvelope: 'encrypted-name',
          descriptionEnvelope: 'encrypted-description',
          membershipProcessStatusEnvelope: 'encrypted-process-status',
          godparentsEnvelope: 'encrypted-godparents',
        },
      },
    }), { handle: () => of(null) } as any)).not.toThrow();
  });

  it('allows protected binary bodies to reach their endpoint decoder', () => {
    expect(() => interceptor.intercept(context('user', '/api/meetings', {
      method: 'POST',
      body: Buffer.from([0xa1, 0x01, 0x02]),
    }), { handle: () => of(null) } as any)).not.toThrow();
  });
});
