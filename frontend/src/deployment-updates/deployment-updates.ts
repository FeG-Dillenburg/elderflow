import { reactive } from 'vue';
import { request } from '../api/domain';
import { auth } from '../auth/auth';

export interface DeploymentAnnouncement {
  id: string;
  identifier: string;
  category: 'feature' | 'improvement' | 'bugfix';
  registeredAt: string;
}

const state = reactive({
  visible: false,
  mode: 'unread' as 'unread' | 'history',
  entries: [] as DeploymentAnnouncement[],
  loading: false,
  saving: false,
  error: false,
  warning: false,
  blocking: false,
  remainingCount: 0,
});
let controller = new AbortController();
let resume: (() => void) | null = null;
let remaining: DeploymentAnnouncement[] = [];
const pageSize = 1000;

function nextPage(): void {
  state.entries = remaining.splice(0, pageSize);
  state.remainingCount = remaining.length;
}

function signal(): AbortSignal {
  return AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
}

function reset(): void {
  controller.abort();
  controller = new AbortController();
  resume?.();
  resume = null;
  remaining = [];
  Object.assign(state, { visible: false, entries: [], loading: false, saving: false,
    error: false, warning: false, blocking: false, remainingCount: 0 });
}

export const deploymentUpdates = {
  state,
  reset,
  async beforeLogin(): Promise<void> {
    const userId = auth.state.user?.id;
    const attempt = controller;
    state.blocking = true;
    state.warning = false;
    try {
      const entries = await request<DeploymentAnnouncement[]>('/api/deployment-updates/unread', {
        method: 'POST', signal: signal(),
      });
      if (attempt.signal.aborted || auth.state.user?.id !== userId) return;
      if (entries.length) {
        remaining = [...entries];
        nextPage();
        state.mode = 'unread';
        state.error = false;
        state.visible = true;
        await new Promise<void>((resolve) => { resume = resolve; });
      }
    } catch {
      if (!attempt.signal.aborted && auth.state.user?.id === userId) state.warning = true;
    } finally {
      if (attempt === controller) state.blocking = false;
    }
  },
  async acknowledge(): Promise<void> {
    if (state.saving || state.mode !== 'unread') return;
    const attempt = controller;
    const userId = auth.state.user?.id;
    // Keep the displayed snapshot; never acknowledge a newly fetched catalog.
    const ids = state.entries.map((entry) => entry.id);
    state.saving = true;
    state.error = false;
    try {
      // Each displayed page is one bounded, atomic server transaction. Do not
      // acknowledge a partially successful batch of a larger displayed set.
      await request<void>('/api/deployment-updates/acknowledge', {
        method: 'POST', body: JSON.stringify({ ids }), signal: signal(),
      });
      if (attempt.signal.aborted || auth.state.user?.id !== userId) return;
      if (remaining.length) {
        nextPage();
        return;
      }
      state.visible = false;
      resume?.();
      resume = null;
    } catch {
      if (!attempt.signal.aborted && auth.state.user?.id === userId) state.error = true;
    } finally {
      if (attempt === controller) state.saving = false;
    }
  },
  async history(): Promise<void> {
    if (state.blocking || state.loading) return;
    const attempt = controller;
    const userId = auth.state.user?.id;
    if (!userId) return;
    state.mode = 'history';
    state.visible = true;
    state.entries = [];
    state.loading = true;
    state.error = false;
    try {
      const entries = await request<DeploymentAnnouncement[]>('/api/deployment-updates/history', { signal: signal() });
      if (!attempt.signal.aborted && auth.state.user?.id === userId) state.entries = entries;
    } catch {
      if (!attempt.signal.aborted && auth.state.user?.id === userId) state.error = true;
    } finally {
      if (attempt === controller) state.loading = false;
    }
  },
  closeHistory(): void {
    if (state.mode === 'history') state.visible = false;
  },
};
