import sodium from 'libsodium-wrappers-sumo';

export type LockReason = 'explicit' | 'inactivity' | 'absolute' | 'logout' | 'identity-change' | 'authorization-loss' | 'remote';

interface UnlockKeys {
  organizationRootKey: Uint8Array;
  contentKey: Uint8Array;
  signingPrivateKey?: Uint8Array;
  noncePrefix?: Uint8Array;
}

interface UnlockSessionOptions {
  inactivityMs?: number;
  absoluteMs?: number;
  onLock?: (reason: LockReason) => void;
}

export class UnlockSession {
  private readonly inactivityMs: number;
  private readonly absoluteMs: number;
  private readonly onLock?: (reason: LockReason) => void;
  private keys: UnlockKeys | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private absoluteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: UnlockSessionOptions = {}) {
    this.inactivityMs = options.inactivityMs ?? 30 * 60_000;
    this.absoluteMs = options.absoluteMs ?? 12 * 60 * 60_000;
    this.onLock = options.onLock;
  }

  unlock(keys: UnlockKeys): void {
    this.lockWithoutNotification();
    this.keys = keys;
    this.resetInactivityTimer();
    this.absoluteTimer = setTimeout(() => this.lock('absolute'), this.absoluteMs);
  }

  isUnlocked(): boolean {
    return this.keys !== null;
  }

  recordTrustedForegroundActivity(): void {
    if (!this.keys || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
    this.resetInactivityTimer();
  }

  lock(reason: LockReason): void {
    if (!this.keys) return;
    this.lockWithoutNotification();
    this.onLock?.(reason);
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => this.lock('inactivity'), this.inactivityMs);
  }

  private lockWithoutNotification(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.absoluteTimer) clearTimeout(this.absoluteTimer);
    this.inactivityTimer = null;
    this.absoluteTimer = null;
    if (this.keys) {
      sodium.memzero(this.keys.organizationRootKey);
      sodium.memzero(this.keys.contentKey);
      if (this.keys.signingPrivateKey) sodium.memzero(this.keys.signingPrivateKey);
      if (this.keys.noncePrefix) sodium.memzero(this.keys.noncePrefix);
      this.keys = null;
    }
  }
}
