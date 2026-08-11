import { reactive } from 'vue';
import sodium from 'libsodium-wrappers-sumo';
import { api, type AuthUser } from '../api/domain';
import { unlockWithPassphrase, type PublicKeyState } from './crypto';
import { UnlockSession, type LockReason } from './unlock-session';
import { recoverySession } from './recovery-session';
import { isE2eeKeyOperator } from './roles';
import { bytesToBase64Url } from './protocol';
import { setProtectedContentUnlocked } from './content-visibility';
import { scalarSession } from './scalar-session';
import { meetingDocumentSession } from './meeting-document-session';

const state = reactive({
  status: 'locked' as 'locked' | 'unlocking' | 'unlocked',
  promptVisible: false,
  error: false,
});
let keyState: PublicKeyState | null = null;
let epochId: string | null = null;
let abortController: AbortController | null = null;
let activeUserId: string | null = null;
let authorizationPoll: ReturnType<typeof setInterval> | null = null;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('elderflow.protected-text-lock');
const session = new UnlockSession({ onLock: handleSessionLock });

channel?.addEventListener('message', ({ data }) => {
  if (data?.type === 'lock' && data.userId === activeUserId) protectedText.lock('remote', false);
});

const trustedActivity = () => session.recordTrustedForegroundActivity();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', trustedActivity, { passive: true });
  window.addEventListener('pointerdown', trustedActivity, { passive: true });
  window.addEventListener('elderflow:authorization-loss', () => protectedText.lock('authorization-loss'));
}

export const protectedText = {
  state,
  isEligible(user: AuthUser | null): boolean {
    return isE2eeKeyOperator(user);
  },
  async offerUnlock(user: AuthUser | null): Promise<void> {
    protectedText.lock('identity-change', false);
    activeUserId = user?.id ?? null;
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
          noncePrefix: bytesToBase64Url(noncePrefix),
          signingPublicKey: bytesToBase64Url(signing.publicKey),
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
      scalarSession.unlock({
        organizationId: keyState.organizationId,
        ockId: keyState.ockId,
        clientEpochId: newEpochId,
        noncePrefix,
        contentKey: keys.contentKey,
        signingPrivateKey: signing.privateKey,
      });
      meetingDocumentSession.unlock({
        organizationId: keyState.organizationId,
        ockId: keyState.ockId,
        clientEpochId: newEpochId,
        noncePrefix,
        contentKey: keys.contentKey,
        signingPrivateKey: signing.privateKey,
      });
      state.status = 'unlocked';
      setProtectedContentUnlocked(true);
      state.promptVisible = false;
      startAuthorizationPolling();
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
      if (coordinate) coordinateLock();
    }
  },
};

function finishLock(): void {
  scalarSession.lock();
  meetingDocumentSession.lock();
  if (authorizationPoll) clearInterval(authorizationPoll);
  authorizationPoll = null;
  state.status = 'locked';
  setProtectedContentUnlocked(false);
  state.promptVisible = false;
  state.error = false;
  epochId = null;
}

function startAuthorizationPolling(): void {
  if (authorizationPoll) clearInterval(authorizationPoll);
  authorizationPoll = setInterval(() => {
    if (!session.isUnlocked() || !keyState || recoverySession.isActive()) return;
    void api.e2eeKeyMetadata()
      .then((metadata) => {
        if (keyState && metadata.generation !== keyState.generation) protectedText.lock('authorization-loss');
      })
      .catch(() => protectedText.lock('authorization-loss'));
  }, 30_000);
}

function handleSessionLock(reason: LockReason): void {
  const revokedEpoch = epochId;
  void recoverySession.abort();
  finishLock();
  if (revokedEpoch) void api.revokeE2eeClientEpoch(revokedEpoch).catch(() => undefined);
  if (reason !== 'remote') coordinateLock();
}

function coordinateLock(): void {
  if (activeUserId) channel?.postMessage({ type: 'lock', userId: activeUserId });
}
