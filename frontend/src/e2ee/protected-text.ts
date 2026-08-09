import { reactive } from 'vue';
import sodium from 'libsodium-wrappers-sumo';
import { api, type AuthUser } from '../api/domain';
import { unlockWithPassphrase, type PublicKeyState } from './crypto';
import { UnlockSession, type LockReason } from './unlock-session';
import { recoverySession } from './recovery-session';

const state = reactive({
  status: 'locked' as 'locked' | 'unlocking' | 'unlocked',
  promptVisible: false,
  error: false,
});
let keyState: PublicKeyState | null = null;
let epochId: string | null = null;
let abortController: AbortController | null = null;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('elderflow.protected-text-lock');
const session = new UnlockSession({ onLock: handleSessionLock });

channel?.addEventListener('message', ({ data }) => {
  if (data === 'lock') session.lock('remote');
});

const trustedActivity = () => session.recordTrustedForegroundActivity();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', trustedActivity, { passive: true });
  window.addEventListener('pointerdown', trustedActivity, { passive: true });
}

export const protectedText = {
  state,
  isEligible(user: AuthUser | null): boolean {
    return Boolean(user && ['superadmin', 'admin', 'user'].includes(user.role));
  },
  async offerUnlock(user: AuthUser | null): Promise<void> {
    protectedText.lock('identity-change', false);
    if (!protectedText.isEligible(user)) return;
    try {
      keyState = await api.e2eeKeyState();
      state.promptVisible = true;
    } catch {
      keyState = null;
      state.promptVisible = false;
    }
  },
  skip(): void {
    state.promptVisible = false;
    state.error = false;
  },
  showUnlock(): void {
    if (keyState) state.promptVisible = true;
  },
  async unlock(passphrase: string): Promise<void> {
    if (!keyState) return;
    abortController?.abort();
    abortController = new AbortController();
    state.status = 'unlocking';
    state.error = false;
    try {
      const keys = await unlockWithPassphrase(passphrase, keyState, abortController.signal);
      await sodium.ready;
      const signing = sodium.crypto_sign_keypair('uint8array');
      const noncePrefix = crypto.getRandomValues(new Uint8Array(16));
      const newEpochId = crypto.randomUUID();
      try {
        await api.registerE2eeClientEpoch({
          id: newEpochId,
          noncePrefix: toBase64Url(noncePrefix),
          signingPublicKey: toBase64Url(signing.publicKey),
        });
      } catch (error) {
        sodium.memzero(signing.privateKey);
        sodium.memzero(noncePrefix);
        sodium.memzero(keys.organizationRootKey);
        sodium.memzero(keys.contentKey);
        throw error;
      }
      epochId = newEpochId;
      session.unlock({ ...keys, signingPrivateKey: signing.privateKey, noncePrefix });
      state.status = 'unlocked';
      state.promptVisible = false;
    } catch (error) {
      state.status = 'locked';
      if (!(error instanceof DOMException && error.name === 'AbortError')) state.error = true;
    } finally {
      abortController = null;
    }
  },
  lock(reason: LockReason = 'explicit', coordinate = true): void {
    void recoverySession.abort();
    abortController?.abort();
    const wasUnlocked = session.isUnlocked();
    session.lock(reason);
    if (!wasUnlocked) {
      finishLock();
      if (coordinate) channel?.postMessage('lock');
    }
  },
};

function finishLock(): void {
  state.status = 'locked';
  state.promptVisible = false;
  state.error = false;
  epochId = null;
}

function handleSessionLock(reason: LockReason): void {
  const revokedEpoch = epochId;
  void recoverySession.abort();
  finishLock();
  if (revokedEpoch) void api.revokeE2eeClientEpoch(revokedEpoch).catch(() => undefined);
  if (reason !== 'remote') channel?.postMessage('lock');
}

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
