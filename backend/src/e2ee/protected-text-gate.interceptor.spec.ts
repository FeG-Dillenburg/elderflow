import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { PROTECTED_TEXT_REDACTED, ProtectedTextGateInterceptor } from './protected-text-gate.interceptor';

describe('ProtectedTextGateInterceptor', () => {
  const config = { get: jest.fn() };
  const interceptor = new ProtectedTextGateInterceptor(config as any);
  const context = (role: string, originalUrl = '/api/topics', overrides: Record<string, unknown> = {}) => ({
    switchToHttp: () => ({ getRequest: () => ({
      originalUrl,
      method: 'GET',
      headers: {},
      user: { role },
      ...overrides,
    }) }),
  }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('keeps structural metadata while removing legacy Protected text by secure default', async () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'development' : false);
    const result = await lastValueFrom(interceptor.intercept(context('user'), {
      handle: () => of({
        id: 'topic-id', type: 'general', status: 'open', followUpDate: '2026-08-10',
        name: 'Private name', description: 'Private description',
      }),
    } as any));

    expect(result).toEqual({
      id: 'topic-id', type: 'general', status: 'open', followUpDate: '2026-08-10',
      name: PROTECTED_TEXT_REDACTED, description: PROTECTED_TEXT_REDACTED,
    });
  });

  it('always redacts Guest responses even when the development plaintext gate is enabled', async () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'development' : true);
    const result = await lastValueFrom(interceptor.intercept(context('guest', '/api/tasks'), {
      handle: () => of({ id: 'task-id', title: 'Private task', status: 'open' }),
    } as any));

    expect(result).toEqual({ id: 'task-id', title: PROTECTED_TEXT_REDACTED, status: 'open' });
  });

  it('redacts filtered list responses whose original URL contains a query string', async () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'development' : false);
    const result = await lastValueFrom(interceptor.intercept(context('user', '/api/topics?status=open'), {
      handle: () => of([{ type: 'general', status: 'open', name: 'Private name' }]),
    } as any));

    expect(result).toEqual([{ type: 'general', status: 'open', name: PROTECTED_TEXT_REDACTED }]);
  });

  it('requires an unlocked local client before returning development plaintext', async () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'development' : true);
    const locked = await lastValueFrom(interceptor.intercept(context('user'), {
      handle: () => of({ type: 'general', status: 'open', name: 'Private name' }),
    } as any));
    const unlocked = await lastValueFrom(interceptor.intercept(context('user', '/api/topics', {
      headers: { 'x-elderflow-e2ee-unlocked': '1' },
    }), {
      handle: () => of({ type: 'general', status: 'open', name: 'Private name' }),
    } as any));

    expect(locked).toMatchObject({ name: PROTECTED_TEXT_REDACTED });
    expect(unlocked).toMatchObject({ name: 'Private name' });
  });

  it('rejects legacy plaintext writes while allowing structural-only mutations', () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'development' : false);
    expect(() => interceptor.intercept(context('user', '/api/topics/id', {
      method: 'PUT', body: { name: 'Private name' },
    }), { handle: () => of(null) } as any)).toThrow(ForbiddenException);

    expect(() => interceptor.intercept(context('user', '/api/meetings/id/topics/order', {
      method: 'PUT', body: { items: [{ id: 'one', sectionId: 'two', position: 1 }] },
    }), { handle: () => of(null) } as any)).not.toThrow();
  });

  it('never permits the plaintext development path in production', () => {
    config.get.mockImplementation((key: string) => key === 'NODE_ENV' ? 'production' : true);
    expect(() => interceptor.intercept(context('user', '/api/tasks', {
      method: 'POST',
      headers: { 'x-elderflow-e2ee-unlocked': '1' },
      body: { title: 'Private task', status: 'open' },
    }), { handle: () => of(null) } as any)).toThrow(ForbiddenException);
  });
});
