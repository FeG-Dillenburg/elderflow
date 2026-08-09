import { api } from '../api/domain';

let activeCeremonyId: string | null = null;

export const recoverySession = {
  set(id: string): void {
    activeCeremonyId = id;
  },
  clear(): void {
    activeCeremonyId = null;
  },
  async abort(): Promise<void> {
    const id = activeCeremonyId;
    activeCeremonyId = null;
    if (id) await api.abortE2eeRecovery(id).catch(() => undefined);
  },
};
