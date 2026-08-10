import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import { auth } from '../auth/auth';
import type { PermissionCategory } from '../api/domain';
import { installation, setupRedirect } from '../installation';
import { isE2eeKeyOperator } from '../e2ee/roles';
import { recoverySession } from '../e2ee/recovery-session';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup/', alias: '/setup', name: 'setup', component: () => import('../views/SetupView.vue'), meta: { public: true } },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView, meta: { permission: 'dashboard' } },
    { path: '/meetings', name: 'meetings', component: () => import('../views/MeetingsView.vue'), meta: { permission: 'meetings' } },
    { path: '/meetings/:id', name: 'meeting', component: () => import('../views/MeetingAgendaView.vue'), meta: { permission: 'meetings' } },
    { path: '/meetings/:id/prepare', name: 'meeting-prepare', component: () => import('../views/MeetingPreparationView.vue'), meta: { permission: 'meetings', manage: true } },
    { path: '/topics', name: 'topics', component: () => import('../views/TopicsView.vue'), meta: { permission: 'topics' } },
    { path: '/topics/:id', name: 'topic', component: () => import('../views/TopicDetailView.vue'), meta: { permission: 'topics' } },
    { path: '/tasks', name: 'tasks', component: () => import('../views/TasksView.vue'), meta: { permission: 'tasks' } },
    { path: '/agenda-sections', name: 'agenda-sections', component: () => import('../views/AgendaSectionsView.vue'), meta: { permission: 'contentSettings' } },
    { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { permission: 'users' } },
    { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue') },
    { path: '/key-recovery', name: 'key-recovery', component: () => import('../views/RecoveryView.vue'), meta: { keyOperator: true } },
  ],
});

router.beforeEach(async (to) => {
  const installationRoute = setupRedirect(installation.setupRequired, to.name);
  if (installationRoute !== true) return installationRoute;
  if (to.name === 'setup') return true;
  await auth.initialize();
  if (to.meta.public) return auth.state.user ? { path: '/' } : true;
  if (!auth.state.user) return { path: '/login', query: { redirect: to.fullPath } };
  if (recoverySession.isActive() && to.name !== 'key-recovery') return { path: '/key-recovery' };
  if (to.meta.keyOperator && !isE2eeKeyOperator(auth.state.user)) return { path: '/profile' };
  const permission = to.meta.permission as PermissionCategory | undefined;
  if (permission && !auth.canView(permission)) {
    const fallback = (['dashboard', 'meetings', 'topics', 'tasks', 'users', 'contentSettings'] as PermissionCategory[])
      .find((category) => auth.canView(category));
    const paths: Partial<Record<PermissionCategory, string>> = { dashboard: '/', meetings: '/meetings', topics: '/topics', tasks: '/tasks', users: '/users', contentSettings: '/agenda-sections' };
    return { path: fallback ? paths[fallback] : '/profile' };
  }
  if (permission && to.meta.manage && !auth.canManage(permission)) {
    return permission === 'meetings' && typeof to.params.id === 'string' ? { path: `/meetings/${to.params.id}` } : { path: '/' };
  }
  return true;
});

export default router;
