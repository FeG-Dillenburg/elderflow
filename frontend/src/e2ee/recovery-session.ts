import { api } from '../api/domain';

let activeCeremonyId: string | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;

export const recoverySession = {
  set(id: string): void {
    activeCeremonyId = id;
    if (presenceTimer) clearInterval(presenceTimer);
    const confirm = () => void api.confirmE2eeRecoveryPresence(id).catch(() => undefined);
    confirm();
    presenceTimer = setInterval(confirm, 10_000);
  },
  clear(): void {
    activeCeremonyId = null;
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
  },
  isActive(): boolean {
    return activeCeremonyId !== null;
  },
  async abort(): Promise<void> {
    const id = activeCeremonyId;
    recoverySession.clear();
    if (id) await api.abortE2eeRecovery(id).catch(() => undefined);
  },
};
