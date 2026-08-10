import { describe, expect, it, vi } from 'vitest';
import { UnlockSession } from './unlock-session';

describe('Protected-text unlock session', () => {
  it('drops keys after 30 minutes of trusted foreground inactivity', () => {
    vi.useFakeTimers();
    const key = new Uint8Array([4, 5, 6]);
    const session = new UnlockSession({ inactivityMs: 30 * 60_000, absoluteMs: 12 * 60 * 60_000 });

    session.unlock({ organizationRootKey: key, contentKey: new Uint8Array([7, 8, 9]) });
    vi.advanceTimersByTime(30 * 60_000);

    expect(session.isUnlocked()).toBe(false);
    expect([...key]).toEqual([0, 0, 0]);
    vi.useRealTimers();
  });

  it('never extends the 12-hour absolute deadline', () => {
    vi.useFakeTimers();
    const session = new UnlockSession({ inactivityMs: 30 * 60_000, absoluteMs: 12 * 60 * 60_000 });
    session.unlock({ organizationRootKey: new Uint8Array(32), contentKey: new Uint8Array(32) });

    for (let interval = 0; interval < 24; interval += 1) {
      vi.advanceTimersByTime(29 * 60_000);
      session.recordTrustedForegroundActivity();
    }
    vi.advanceTimersByTime(24 * 60_000);

    expect(session.isUnlocked()).toBe(false);
    vi.useRealTimers();
  });

  it('cleans up explicitly and emits a content-free state change', () => {
    const onLock = vi.fn();
    const session = new UnlockSession({ onLock });
    session.unlock({ organizationRootKey: new Uint8Array(32), contentKey: new Uint8Array(32) });

    session.lock('explicit');

    expect(onLock).toHaveBeenCalledWith('explicit');
    expect(onLock).not.toHaveBeenCalledWith(expect.objectContaining({ key: expect.anything() }));
  });
});
