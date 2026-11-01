import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrimeVue from 'primevue/config';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { api, request, type AuthUser } from '../api/domain';
import { auth } from '../auth/auth';
import { externalAuthApi } from '../api/external-auth';
import { protectedText } from '../e2ee/protected-text';
import { formatDate, setLanguage } from '../i18n';
import { tours } from '../tours/tours';
import { tourApi } from '../tours/tour-api';
import DashboardView from '../views/DashboardView.vue';
import ProfileView from '../views/ProfileView.vue';
import DeploymentUpdatesDialog from './DeploymentUpdatesDialog.vue';
import { deploymentUpdates, type DeploymentAnnouncement } from './deployment-updates';

vi.mock('../api/domain', async (original) => ({
  ...await original<typeof import('../api/domain')>(), request: vi.fn(),
}));
vi.mock('../tours/tour-api', () => ({ tourApi: { list: vi.fn(), record: vi.fn() } }));
const user: AuthUser = {
  id: 'updates-user', email: 'updates@example.com', firstName: 'Ada', lastName: 'User', role: 'user', language: 'en',
  permissions: { dashboard: 'view', users: 'hide', references: 'view', meetings: 'view', topics: 'manage',
    tasks: 'view', contentSettings: 'hide', authSettings: 'hide' },
};
const announcement: DeploymentAnnouncement = {
  id: '00000000-0000-4000-8000-000000000001', identifier: 'deployment-updates-dialog',
  category: 'feature', registeredAt: '2026-10-18T10:00:00Z',
};
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', component: { template: '<div />' } },
  { path: '/profile', component: { template: '<div />' } },
] });
let stop: () => void;
const mounted: ReturnType<typeof mount>[] = [];
const settle = async () => { await flushPromises(); await nextTick(); };
function button(label: string) {
  const result = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label);
  expect(result, label).toBeTruthy();
  return result!;
}

beforeEach(async () => {
  auth.completeInitialization(null);
  setLanguage('en');
  vi.mocked(request).mockResolvedValue([announcement]);
  vi.mocked(tourApi.list).mockResolvedValue([{ tourId: 'first-login', version: 1, state: 'completed', completedAt: '2026-01-01' }]);
  vi.mocked(tourApi.record).mockResolvedValue({} as never);
  vi.spyOn(protectedText, 'offerUnlock').mockResolvedValue();
  vi.spyOn(protectedText, 'showUnlock').mockImplementation(() => undefined);
  vi.spyOn(api, 'login').mockResolvedValue({ token: 'local-token', user });
  vi.spyOn(externalAuthApi, 'complete').mockResolvedValue({ token: 'external-token', user });
  await router.push('/profile');
  stop = tours.mount(router);
  mounted.push(mount(DeploymentUpdatesDialog, { attachTo: document.body, global: { plugins: [PrimeVue] } }));
});

afterEach(() => {
  stop();
  mounted.forEach((wrapper) => wrapper.unmount());
  mounted.length = 0;
  auth.completeInitialization(null);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Deployment updates through login and dashboard UI', () => {
  it.each(['local', 'external', 'restore'])('holds unlock and tours until acknowledgement for %s sessions', async (kind) => {
    if (kind === 'local') await auth.login(user.email, 'password');
    else if (kind === 'external') await auth.completeExternal('code');
    else auth.completeInitialization(user, true);
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('What’s new');
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    expect(tourApi.list).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await router.push('/');
    await settle();
    expect(deploymentUpdates.state.visible).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    button('Awesome!').click();
    await settle();
    expect(request).toHaveBeenLastCalledWith('/api/deployment-updates/acknowledge', expect.objectContaining({
      body: JSON.stringify({ ids: [announcement.id] }),
    }));
    expect(deploymentUpdates.state.visible).toBe(false);
    expect(protectedText.showUnlock).toHaveBeenCalledOnce();
  });

  it('keeps a failed acknowledgement visible for retry and never refetches or acknowledges unseen records', async () => {
    await auth.login(user.email, 'password');
    await settle();
    vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
    button('Awesome!').click();
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be saved');
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    vi.mocked(request).mockResolvedValueOnce(undefined);
    button('Awesome!').click();
    await settle();
    expect(protectedText.showUnlock).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('acknowledges large unread histories one displayed page at a time and preserves a failed page for reload', async () => {
    const entries = Array.from({ length: 1001 }, (_, index) => ({
      ...announcement, id: `entry-${index}`,
    }));
    vi.mocked(request).mockResolvedValueOnce(entries);
    await auth.login(user.email, 'password');
    await settle();
    expect(document.querySelectorAll('[role="dialog"] li')).toHaveLength(1000);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('1 more unread updates');
    vi.mocked(request).mockResolvedValueOnce(undefined);
    button('Awesome!').click();
    await settle();
    const firstAcknowledgement = JSON.parse(vi.mocked(request).mock.calls[1][1]?.body as string);
    expect(firstAcknowledgement.ids).toHaveLength(1000);
    expect(firstAcknowledgement.ids).not.toContain('entry-1000');
    expect(document.querySelectorAll('[role="dialog"] li')).toHaveLength(1);
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
    button('Awesome!').click();
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be saved');
    expect(request).toHaveBeenLastCalledWith('/api/deployment-updates/acknowledge', expect.objectContaining({
      body: JSON.stringify({ ids: ['entry-1000'] }),
    }));
    expect(deploymentUpdates.state.visible).toBe(true);
    auth.logout();
    vi.mocked(request).mockResolvedValueOnce([entries[1000]]);
    auth.completeInitialization(user, true);
    await settle();
    expect(document.querySelectorAll('[role="dialog"] li')).toHaveLength(1);
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    vi.mocked(request).mockResolvedValueOnce(undefined);
    button('Awesome!').click();
    await settle();
    expect(protectedText.showUnlock).toHaveBeenCalledOnce();
  });

  it('allows login to continue with a localized warning after an initial request failure', async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
    await auth.login(user.email, 'password');
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('continue using ElderFlow');
    expect(protectedText.showUnlock).toHaveBeenCalledOnce();
    expect(deploymentUpdates.state.visible).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('continues first-login onboarding when the new-user baseline returns no unread entries', async () => {
    vi.mocked(request).mockResolvedValueOnce([]);
    vi.mocked(tourApi.list).mockResolvedValue([]);
    await auth.login(user.email, 'password');
    await settle();
    expect(deploymentUpdates.state.visible).toBe(false);
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Welcome to Elderflow');
  });

  it('offers updates to IT admins without running content tours or unlock', async () => {
    auth.completeInitialization({ ...user, role: 'it-admin' }, true);
    await settle();
    expect(deploymentUpdates.state.visible).toBe(true);
    button('Awesome!').click();
    await settle();
    expect(tourApi.list).not.toHaveBeenCalled();
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    expect(deploymentUpdates.state.blocking).toBe(false);
  });

  it('cancels a stale read on identity change and does not open a dialog for the next user', async () => {
    let finish!: (entries: DeploymentAnnouncement[]) => void;
    vi.mocked(request).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await auth.login(user.email, 'password');
    await settle();
    const signal = vi.mocked(request).mock.calls[0][1]?.signal;
    auth.logout();
    auth.completeInitialization({ ...user, id: 'another-user' });
    finish([announcement]);
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(deploymentUpdates.state.visible).toBe(false);
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
  });

  it('cancels a stale acknowledgement on logout and leaves the next session untouched', async () => {
    await auth.login(user.email, 'password');
    await settle();
    let finish!: () => void;
    vi.mocked(request).mockReturnValueOnce(new Promise((resolve) => { finish = () => resolve(undefined); }));
    button('Awesome!').click();
    await settle();
    const signal = vi.mocked(request).mock.calls[1][1]?.signal;
    auth.logout();
    auth.completeInitialization({ ...user, id: 'another-user' });
    finish();
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(protectedText.showUnlock).not.toHaveBeenCalled();
    expect(deploymentUpdates.state.visible).toBe(false);
  });

  it('groups all unread entries by local date, orders them newest first, translates live, and hides technical keys', async () => {
    vi.mocked(request).mockResolvedValueOnce([
      { ...announcement, id: 'later', identifier: 'unknown-announcement', category: 'bugfix', registeredAt: '2026-10-21T12:00:00Z' },
      announcement,
      { ...announcement, id: 'middle', identifier: 'unknown-improvement', category: 'improvement' },
    ]);
    await auth.login(user.email, 'password');
    await settle();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect([...dialog.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      `${formatDate('2026-10-21T12:00:00Z')}:`, `${formatDate(announcement.registeredAt)}:`,
    ]);
    expect(dialog.querySelectorAll('ul li')).toHaveLength(3);
    expect(dialog.textContent).toContain('New feature');
    expect(dialog.textContent).toContain('Bug fix');
    expect(dialog.textContent).toContain('Improvement');
    expect(dialog.textContent).toContain('ElderFlow has been updated.');
    expect(dialog.textContent).not.toContain('unknown-announcement');
    setLanguage('de');
    await settle();
    expect(dialog.textContent).toContain('18.10.2026');
    expect(dialog.textContent).toContain('Neue Funktion');
    expect(dialog.textContent).toContain('beim Anmelden');
    expect(button('Super!')).toBeTruthy();
    expect(dialog.querySelector('li span')?.getAttribute('aria-hidden')).toBe('true');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('opens dashboard history with loading, retry and empty states and closes without acknowledgement', async () => {
    auth.completeInitialization(user);
    let finish!: (entries: DeploymentAnnouncement[]) => void;
    vi.mocked(request).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    vi.spyOn(api, 'dashboard').mockResolvedValue({ currentMeeting: null, nextMeeting: null, myOpenTasks: [], overdueTasks: [], followUpTopics: [], recentTopics: [] });
    const profile = mount(ProfileView, { global: { plugins: [PrimeVue] } });
    expect(profile.text()).not.toContain('Recent updates');
    profile.unmount();
    mounted.push(mount(DashboardView, { attachTo: document.body, global: { plugins: [PrimeVue] } }));
    button('Recent updates').click();
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Loading updates');
    finish([]);
    await settle();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('No updates');
    button('Close').click();
    await settle();
    vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
    button('Recent updates').click();
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    vi.mocked(request).mockResolvedValueOnce([announcement]);
    button('Retry').click();
    await settle();
    expect(document.querySelector('[role="dialog"] li')?.textContent).toContain('deployed changes');
    button('Close').click();
    await settle();
    expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual(Array(3).fill('/api/deployment-updates/history'));
  });
});
