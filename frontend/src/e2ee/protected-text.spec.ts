import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AuthUser } from '../api/domain';
import { unlockWithPassphrase } from './crypto';
import { protectedText } from './protected-text';

vi.mock('./crypto', async (importOriginal) => ({
  ...await importOriginal<typeof import('./crypto')>(),
  unlockWithPassphrase: vi.fn(),
}));

describe('Protected text unlock prompt', () => {
  afterEach(() => {
    protectedText.lock('explicit', false);
    vi.restoreAllMocks();
  });

  it('prepares a manual unlock without automatically opening the prompt', async () => {
    vi.spyOn(api, 'e2eeKeyState').mockResolvedValue({ organizationId: 'organization' } as any);
    const user = { id: 'admin', role: 'admin' } as AuthUser;

    await protectedText.offerUnlock(user, false);

    expect(protectedText.state.promptVisible).toBe(false);
    protectedText.showUnlock();
    expect(protectedText.state.promptVisible).toBe(true);
  });

  it('revokes every client epoch created by one unlock session when it locks', async () => {
    vi.spyOn(api, 'e2eeKeyState').mockResolvedValue({
      organizationId: '00000000-0000-4000-8000-000000000281',
      ockId: '00000000-0000-4000-8000-000000000282',
    } as any);
    vi.spyOn(api, 'registerE2eeClientEpoch').mockResolvedValue({ registered: true });
    const revoke = vi.spyOn(api, 'revokeE2eeClientEpoch').mockResolvedValue(undefined);
    vi.mocked(unlockWithPassphrase).mockResolvedValue({
      organizationRootKey: new Uint8Array(32).fill(1),
      contentKey: new Uint8Array(32).fill(2),
      historicalContentKeys: new Map(),
    });
    const user = { id: 'admin', role: 'admin' } as AuthUser;
    await protectedText.offerUnlock(user, false);
    await protectedText.unlock('passphrase');
    await protectedText.rotateClientEpoch();
    const registeredIds = vi.mocked(api.registerE2eeClientEpoch).mock.calls
      .map(([input]) => input.id);

    protectedText.lock('explicit', false);
    await Promise.resolve();

    expect(registeredIds).toHaveLength(2);
    expect(revoke.mock.calls.map(([id]) => id).sort()).toEqual([...registeredIds].sort());
  });
});
