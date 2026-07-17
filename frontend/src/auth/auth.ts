import { computed, reactive } from 'vue';
import { api, type AuthUser, type PermissionCategory, type PermissionLevel } from '../api/domain';
import { clearSessionToken, getSessionToken, setSessionToken } from './session';

const state = reactive<{ user: AuthUser | null; ready: boolean }>({ user: null, ready: false });
let initialization: Promise<void> | null = null;

export const auth = {
  state,
  user: computed(() => state.user),
  async initialize(): Promise<void> {
    if (state.ready) return;
    if (!initialization) {
      initialization = api.me()
        .then((user) => { state.user = user; })
        .catch(() => { clearSessionToken(); state.user = null; })
        .finally(() => { state.ready = true; });
    }
    return initialization;
  },
  async login(email: string, password: string): Promise<void> {
    const result = await api.login({ email, password });
    setSessionToken(result.token);
    state.user = result.user;
    state.ready = true;
  },
  logout(): void {
    clearSessionToken();
    state.user = null;
    state.ready = true;
  },
  setUser(user: AuthUser): void {
    state.user = user;
  },
  completeInitialization(user: AuthUser | null): void {
    state.user = user;
    state.ready = true;
  },
  permission(category: PermissionCategory): PermissionLevel {
    return state.user?.permissions[category] ?? 'hide';
  },
  canView(category: PermissionCategory): boolean {
    return auth.permission(category) !== 'hide';
  },
  canManage(category: PermissionCategory): boolean {
    return auth.permission(category) === 'manage';
  },
  hasToken(): boolean {
    return Boolean(getSessionToken());
  },
};
