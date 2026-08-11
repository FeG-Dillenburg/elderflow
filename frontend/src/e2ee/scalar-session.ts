import sodium from "libsodium-wrappers-sumo";
import { decryptScalar, encryptScalar } from "./scalar-codec";
import { ScalarFieldContext } from "./scalar-registry";

export type { ScalarFieldContext } from "./scalar-registry";

interface ScalarSessionKeys {
  organizationId: string;
  ockId: string;
  clientEpochId: string;
  noncePrefix: Uint8Array;
  contentKey: Uint8Array;
  signingPrivateKey: Uint8Array;
}

export class ScalarSession {
  private keys: ScalarSessionKeys | null = null;
  private counters = new Map<string, number>();

  unlock(keys: ScalarSessionKeys): void {
    this.lock();
    this.keys = {
      ...keys,
      noncePrefix: Uint8Array.from(keys.noncePrefix),
      contentKey: Uint8Array.from(keys.contentKey),
      signingPrivateKey: Uint8Array.from(keys.signingPrivateKey),
    };
  }

  isUnlocked(): boolean {
    return this.keys !== null;
  }

  async encrypt(context: ScalarFieldContext, value: string | null): Promise<Uint8Array> {
    const keys = this.requiredKeys();
    const counterKey = `${context.aggregateType}:${context.recordId}:${context.fieldId}`;
    const writeCounter = (this.counters.get(counterKey) ?? 0) + 1;
    this.counters.set(counterKey, writeCounter);
    try {
      return await encryptScalar({
        ...context,
        organizationId: keys.organizationId,
        ockId: keys.ockId,
        clientEpochId: keys.clientEpochId,
        writeCounter,
        noncePrefix: keys.noncePrefix,
        contentKey: keys.contentKey,
        signingPrivateKey: keys.signingPrivateKey,
        value,
      });
    } catch (error) {
      this.counters.delete(counterKey);
      throw error;
    }
  }

  async decrypt(context: ScalarFieldContext, envelope: Uint8Array): Promise<string | null> {
    const keys = this.requiredKeys();
    return decryptScalar({
      ...context,
      organizationId: keys.organizationId,
      ockId: keys.ockId,
      envelope,
      contentKey: keys.contentKey,
    });
  }

  lock(): void {
    if (this.keys) {
      sodium.memzero(this.keys.noncePrefix);
      sodium.memzero(this.keys.contentKey);
      sodium.memzero(this.keys.signingPrivateKey);
    }
    this.keys = null;
    this.counters.clear();
  }

  private requiredKeys(): ScalarSessionKeys {
    if (!this.keys) throw new Error("E2EE_PROTECTED_TEXT_LOCKED");
    return this.keys;
  }
}

export const scalarSession = new ScalarSession();
