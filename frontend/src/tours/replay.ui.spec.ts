import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import PrimeVue from 'primevue/config';
import { api } from '../api/domain';
import { auth } from '../auth/auth';
import { protectedText } from '../e2ee/protected-text';
import { setLanguage } from '../i18n';
import MeetingsView from '../views/MeetingsView.vue';
import TourHost from './TourHost.vue';
import ToursHelp from './ToursHelp.vue';
import { tourApi } from './tour-api';
import { tours } from './tours';

const user = {
  id: 'replay-user', email: 'replay@example.com', firstName: 'Replay', lastName: 'User', role: 'user', language: 'en',
  permissions: { dashboard: 'view', users: 'view', references: 'view', topics: 'manage', meetings: 'manage', tasks: 'manage', contentSettings: 'view', authSettings: 'hide' },
} as const;
let wrapper: ReturnType<typeof mount>;
const settle = async () => {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 60));
  await flushPromises();
};

async function openHelp() {
  document.querySelector<HTMLButtonElement>('[data-tour-id="tours-help"]')!.click();
  await settle();
}
async function replayMeeting() {
  const replay = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.startsWith('Meeting creation and preparation'));
  expect(replay).toBeTruthy();
  replay!.click();
  await settle();
}

async function app() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Dashboard</div>' } },
      { path: '/meetings', component: MeetingsView },
    ],
  });
  await router.push('/');
  await router.isReady();
  wrapper = mount({ render: () => h('div', [h(TourHost), h(ToursHelp), h(RouterView)]) }, {
    attachTo: document.body,
    global: { plugins: [router, PrimeVue] },
  });
  await settle();
  return router;
}

describe('Manual Meeting-tour replay through the application Help menu', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    HTMLElement.prototype.scrollIntoView = vi.fn();
    setLanguage('en');
    auth.completeInitialization(user);
    protectedText.state.status = 'unlocked';
    vi.spyOn(tourApi, 'list').mockResolvedValue([]);
    vi.spyOn(tourApi, 'record').mockResolvedValue({} as never);
    vi.spyOn(api, 'meetings').mockResolvedValue([]);
    vi.spyOn(api, 'userDirectory').mockResolvedValue([user as any]);
    vi.spyOn(api, 'createMeeting');
  });
  afterEach(() => {
    wrapper?.unmount();
    auth.completeInitialization(null);
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('navigates from the dashboard and immediately opens creation without manually visiting Meetings', async () => {
    const router = await app();
    await openHelp();
    await replayMeeting();
    expect(router.currentRoute.value.path).toBe('/meetings');
    expect(document.querySelector('[data-tour-id="meeting-create-basics"]')).toBeTruthy();
    expect(tours.state.stepId).toBe('create-basics');
    expect(api.createMeeting).not.toHaveBeenCalled();
  });
  it('does not queue a delayed replay when navigation is canceled', async () => {
    const router = await app();
    const removeGuard = router.beforeEach((to) => to.path === '/meetings' ? false : true);
    await openHelp();
    await replayMeeting();
    expect(router.currentRoute.value.path).toBe('/');
    expect(tours.state.meetingReplay).toBe(false);
    removeGuard();
    await router.push('/meetings');
    await settle();
    expect(document.querySelector('[data-tour-id="meeting-create-basics"]')).toBeNull();
    expect(tours.state.activeId).toBeNull();
  });
  it('immediately replays when the Meetings view is already open', async () => {
    const router = await app();
    await router.push('/meetings');
    await settle();
    await openHelp();
    await replayMeeting();
    expect(tours.state.stepId).toBe('create-basics');
    expect(document.querySelector('[data-tour-id="meeting-create-basics"]')).toBeTruthy();
    expect(api.createMeeting).not.toHaveBeenCalled();
  });

});
