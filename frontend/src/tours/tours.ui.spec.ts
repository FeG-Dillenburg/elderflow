import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrimeVue from 'primevue/config';
import { reactive, nextTick } from 'vue';
import { api } from '../api/domain';
import { externalAuthApi } from '../api/external-auth';
import { installation } from '../installation';
import router from '../router';
import LoginView from '../views/LoginView.vue';
import UnlockDialog from '../e2ee/UnlockDialog.vue';
import { protectedText } from '../e2ee/protected-text';
import { auth } from '../auth/auth';
import { setLanguage } from '../i18n';
import TopicFormFields from '../components/TopicFormFields.vue';
import TourHost from './TourHost.vue';
import { tourApi } from './tour-api';

vi.mock('./tour-api', () => ({ tourApi: { list: vi.fn(), record: vi.fn() } }));
const user = {
  id: 'tour-user', email: 'tour@example.com', firstName: 'Tour', lastName: 'User', role: 'user', language: 'en',
  permissions: { dashboard: 'view', users: 'view', references: 'view', topics: 'manage', meetings: 'manage', tasks: 'manage', contentSettings: 'view', authSettings: 'hide' },
} as const;
const mounted: Array<ReturnType<typeof mount>> = [];
async function settle() { await flushPromises(); await nextTick(); await new Promise((resolve) => setTimeout(resolve, 30)); }
function click(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.driver-popover button')).find((b) => b.textContent === label);
  expect(button, `tour button ${label}`).toBeTruthy();
  button!.click();
}
function openForm() {
  const draft = reactive({ type: 'generic' as const, name: '', followUpDate: null });
  const form = mount(TopicFormFields, {
    attachTo: document.body,
    props: { id: 'tour-form', modelValue: draft, users: [], sections: [], active: true, tourEnabled: true,
      onChange: (patch: object) => Object.assign(draft, patch) },
    global: { plugins: [PrimeVue], stubs: { RichTextEditor: true, DatePicker: true, TopicMoreOptions: true } },
  });
  mounted.push(form);
  return { form, draft };
}

describe('Product tours through the visible UI', () => {
  beforeEach(() => {
    setLanguage('en');
    auth.completeInitialization(user);
    vi.mocked(tourApi.list).mockResolvedValue([]);
    vi.mocked(tourApi.record).mockResolvedValue({} as never);
    mounted.push(mount(TourHost, { attachTo: document.body }));
  });
  afterEach(() => {
    mounted.reverse().forEach((wrapper) => wrapper.unmount());
    mounted.length = 0;
    auth.completeInitialization(null);
    document.body.innerHTML = '';
    protectedText.lock('explicit', false);
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('advances by Next and by the requested option, and highlights godparents, and finishes with Generic selected', async () => {
    const { draft, form } = openForm();
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Select Topic Type');
    click('Next');
    await settle();
    expect(draft.type).toBe('person');
    await form.get('[data-tour-id="topic-type-new-membership"]').trigger('click');
    await settle();
    expect(draft.type).toBe('new_membership');
    click('Next');
    await settle();
    expect(draft.type).toBe('new_membership');
    expect(form.get('[data-tour-id="topic-godparents"]').classes()).toContain('driver-active-element');
    expect(document.querySelector('.driver-popover-description')?.textContent).toContain('godparent');
    click('Next');
    await settle();
    expect(draft.type).toBe('recurring');
    click('Finish');
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
    expect(tourApi.record).toHaveBeenCalledWith(expect.objectContaining({ tourId: 'new-topic-dialog', event: 'complete', stepId: 'topic-type-recurring' }), expect.any(AbortSignal));
    expect(draft.type).toBe('generic');
  });
  it.each([100, 450])('repositions the popover when the dialog moves at %sms without a window resize', async (delay) => {
    const { form } = openForm();
    for (const type of ['generic', 'person']) {
      const option = form.get(`[data-tour-id="topic-type-${type}"]`).element;
      let top = 200;
      vi.spyOn(option, 'getBoundingClientRect').mockImplementation(() => ({
        x: 100, y: top, top, left: 100, right: 200, bottom: top + 30, width: 100, height: 30,
        toJSON: () => ({}),
      }));
      if (type === 'person') click('Next');
      await settle();
      const popover = document.querySelector<HTMLElement>('.driver-popover')!;
      const originalTop = parseFloat(popover.style.top);
      expect(Number.isFinite(originalTop)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, delay));
      top = 320;
      await vi.waitFor(() => expect(parseFloat(popover.style.top)).toBe(originalTop + 120));
    }
  });

  it('blocks unrelated controls, supports keyboard Escape, and retries on the next dialog opening', async () => {
    const { form, draft } = openForm();
    await settle();
    await form.get('[data-tour-id="topic-type-recurring"]').trigger('click');
    expect(draft.type).toBe('generic');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
    expect(tourApi.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'skip' }), expect.any(AbortSignal));
    await form.setProps({ active: false });
    await form.setProps({ active: true });
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Select Topic Type');
  });

  it('does not offer a completed version or reuse a prior user’s delayed eligibility', async () => {
    vi.mocked(tourApi.list).mockResolvedValueOnce([{ tourId: 'new-topic-dialog', version: 1, state: 'completed', completedAt: '2026-09-27T12:00:00Z' }]);
    const { form } = openForm();
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
    await form.setProps({ active: false });
    let resolve!: (value: never[]) => void;
    vi.mocked(tourApi.list).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await form.setProps({ active: true });
    await flushPromises();
    auth.completeInitialization({ ...user, id: 'another-user' });
    resolve([]);
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
  });

  it('shows translated controls and returns focus inside the still-open form', async () => {
    setLanguage('de');
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.append(opener);
    opener.focus();
    openForm();
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Themenart auswählen');
    expect(document.activeElement?.textContent).toBe('Weiter');
    click('Überspringen');
    await settle();
    expect(document.activeElement?.querySelector('[data-tour-id="topic-type-generic"]')).toBeTruthy();
  });

  it.each(['Next', 'password field'])('offers Welcome after login, waits for unlock via %s, and explains mentions', async (unlockAction) => {
    installation.setupRequired = false;
    auth.completeInitialization(null);
    await router.push('/login?redirect=/meetings');
    vi.spyOn(api, 'login').mockResolvedValue({ token: 'test-token', user });
    vi.spyOn(api, 'e2eeKeyState').mockResolvedValue({ organizationId: 'test' } as never);
    vi.spyOn(externalAuthApi, 'publicProvider').mockResolvedValue(null);
    const login = mount(LoginView, { attachTo: document.body, global: { plugins: [router, PrimeVue] } });
    mounted.push(login);
    mounted.push(mount(UnlockDialog, { attachTo: document.body, global: { plugins: [PrimeVue], stubs: { Password: false } } }));
    const landing = document.createElement('h1');
    landing.dataset.tourId = 'dashboard-heading';
    landing.textContent = 'Dashboard';
    document.body.append(landing);
    for (const id of ['nav-meetings', 'nav-topics', 'nav-my-mentions']) {
      const link = document.createElement('a');
      link.dataset.tourId = id;
      link.textContent = id;
      document.body.append(link);
    }
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
    await login.get('form').trigger('submit');
    await settle();
    await vi.waitFor(() => expect(router.currentRoute.value.path, login.text()).toBe('/'));
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Welcome to Elderflow');
    expect(document.querySelector('[data-tour-id="unlock-dialog"]')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Welcome to Elderflow');
    click('Start');
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Elderflow is encrypted');
    click('Next');
    await settle();
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Enter encryption password');
    if (unlockAction === 'Next') click('Next');
    else document.querySelector<HTMLInputElement>('[data-tour-id="unlock-passphrase"]')!.click();
    await settle();
    expect(document.querySelector('.driver-popover')).toBeNull();
    expect(document.activeElement?.getAttribute('data-tour-id')).toBe('unlock-passphrase');
    document.querySelector<HTMLButtonElement>('.continue-button')!.click();
    await settle();
    expect(document.querySelector('.driver-popover-description')?.textContent).toContain('dashboard');
    expect(document.querySelector('.driver-popover')?.getAttribute('aria-labelledby')).toBeNull();
    for (let step = 0; step < 3; step += 1) {
      click('Next');
      await settle();
    }
    expect(document.querySelector('[data-tour-id="nav-my-mentions"]')?.classList.contains('driver-active-element')).toBe(true);
    expect(document.querySelector('.driver-popover-description')?.textContent).toBe('Here you can see all topics where you were mentioned.');
    click('Skip');
    await settle();
    expect(router.currentRoute.value.path).toBe('/meetings');
  });

  it('queues overlapping dialog triggers and leaves only one tour visible', async () => {
    const first = openForm();
    await settle();
    const second = openForm();
    await settle();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    click('Skip');
    await settle();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    click('Next');
    await settle();
    expect(first.draft.type).toBe('generic');
    expect(second.draft.type).toBe('person');
  });

  it('does not mutate a retired dialog after a delayed start response', async () => {
    let resolve!: (value: never) => void;
    vi.mocked(tourApi.record).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { form, draft } = openForm();
    await settle();
    await form.setProps({ active: false });
    await form.get('[data-tour-id="topic-type-person"]').trigger('click');
    resolve({} as never);
    await settle();
    expect(draft.type).toBe('person');
    expect(document.querySelector('.driver-popover')).toBeNull();
  });

});
