import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AuthUser } from '../api/domain';
import { protectedText } from './protected-text';

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
});
