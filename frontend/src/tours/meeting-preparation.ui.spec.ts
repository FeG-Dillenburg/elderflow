import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import PrimeVue from 'primevue/config';
import { api, type Meeting } from '../api/domain';
import { auth } from '../auth/auth';
import { protectedText } from '../e2ee/protected-text';
import { setLanguage } from '../i18n';
import MeetingsView from '../views/MeetingsView.vue';
import MeetingPreparationView from '../views/MeetingPreparationView.vue';
import { createMeetingWorkspace, meetingRouteFactoryKey } from '../meetings/workspace';
import { createMeetingRouteOperations } from '../meetings/workspace/production-adapter';
import { tourApi } from './tour-api';
import { tours } from './tours';
import { tourRegistry } from './registry';

const user = {
  id: 'leader', email: 'leader@example.com', firstName: 'Lee', lastName: 'Leader', role: 'user', language: 'en',
  permissions: { dashboard: 'view', users: 'view', references: 'view', topics: 'manage', meetings: 'manage', tasks: 'manage', contentSettings: 'view', authSettings: 'hide' },
} as const;
const section = { id: 'discussion', name: 'Discussion', position: 1, defaultTopicType: 'generic' };
const editor = defineComponent({
  props: ['modelValue'], emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', [
      h('input', { type: 'color', 'aria-label': 'Text color' }),
      h('textarea', {
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      }),
    ]);
  },
});
let wrapper: ReturnType<typeof mount>;
let stop: () => void;
let appRouter: ReturnType<typeof createRouter>;
let meeting: Meeting;
let topics: any[];
let appearance = 0;
let delayTextWrite: Promise<void> | undefined;
async function settle() { await flushPromises(); }
function next() {
  const button = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn');
  expect(button?.style.display).not.toBe('none');
  expect(button).toBeTruthy();
  button!.click();
}
async function at(step: string) {
  const marker = tourRegistry['meeting-preparation'].steps.find((candidate) => candidate.id === step)?.target;
  expect(marker).toBeDefined();
  // The engine publishes the step before its target and popover finish mounting.
  await vi.waitFor(async () => {
    await settle();
    expect(tours.state.stepId).toBe(step);
    expect(document.querySelector(`[data-tour-id="${marker}"]`)).not.toBeNull();
    expect(document.querySelector('.driver-popover')).not.toBeNull();
  }, { interval: 10 });
  expect(document.querySelector('.tour-skip')).toBeNull();
  expect(document.querySelector('.driver-popover-prev-btn')).toBeNull();
}
function target(id: string) { return document.querySelector<HTMLElement>(`[data-tour-id="${id}"]`)!; }
async function click(id: string) { expect(target(id)).toBeTruthy(); target(id).click(); await settle(); }

async function open(existing: 'generic' | 'person' | 'new_membership' | null = 'generic', sections = [section], automatic = true, beforeSubmit?: () => Promise<void>) {
  topics = existing ? [{ id: 'real-topic', name: 'Actual discussion', type: existing, status: 'open', updates: [] }] : [];
  meeting = { id: 'created-meeting', title: 'Planning', date: '2026-11-14', beginTime: '19:30', status: 'planned', meetingLeaderId: user.id, agenda: [], generalNotes: null } as unknown as Meeting;
  vi.spyOn(api, 'meetings').mockResolvedValue([]);
  vi.spyOn(api, 'userDirectory').mockResolvedValue([user as any]);
  vi.spyOn(api, 'sections').mockResolvedValue(sections as any);
  let suggestionReads = 0;
  vi.spyOn(api, 'meetingSuggestions').mockImplementation(async () => {
    if ((existing === 'person' || existing === 'new_membership') && ++suggestionReads <= 2) return [];
    return topics.filter((topic) => !meeting.agenda!.some((item) => item.topicId === topic.id));
  });
  vi.spyOn(api, 'createMeeting').mockImplementation(async () => structuredClone(meeting));
  vi.spyOn(api, 'updateTopic').mockImplementation(async (id, input) => {
    const topic = topics.find((topic) => topic.id === id); Object.assign(topic, input); return topic;
  });
  vi.spyOn(api, 'createTopic').mockImplementation(async (input) => {
    const topic = { ...input, id: 'new-real-topic', updates: [] }; topics.push(topic); return topic as any;
  });
  const add = (input: any) => {
    const item = { ...input, id: `appearance-${++appearance}`, topic: topics.find((topic) => topic.id === input.topicId), source: 'manual', position: 1 };
    meeting.agenda!.push(item); return item;
  };
  vi.spyOn(api, 'addMeetingTopics').mockImplementation(async (_id, inputs) => inputs.map(add));
  vi.spyOn(api, 'addMeetingTopic').mockImplementation(async (_id, input) => add(input) as any);
  vi.spyOn(api, 'removeMeetingTopic').mockImplementation(async (_id, id) => { meeting.agenda = meeting.agenda!.filter((item) => item.id !== id); });
  vi.spyOn(api, 'updateMeeting').mockImplementation(async (_id, input) => { Object.assign(meeting, input); return structuredClone(meeting); });
  // Preview data is retrieved through the normal API; no tour-specific history.
  vi.spyOn(api, 'topic').mockImplementation(async (id) => ({ ...topics.find((topic) => topic.id === id), appearances: [], tasks: [] }));
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/meetings', component: MeetingsView },
    { path: '/meetings/:id/prepare', component: MeetingPreparationView },
    { path: '/meetings/:id', component: { template: '<div />' } },
    { path: '/topics/:id', component: { template: '<div />' } },
    { path: '/', component: { template: '<div />' } },
  ] });
  appRouter = router;
  await router.push('/meetings'); await router.isReady();
  stop = tours.mount(router);
  wrapper = mount({ render: () => h(RouterView) }, {
    attachTo: document.body,
    global: {
      plugins: [router, PrimeVue],
      provide: { [meetingRouteFactoryKey as symbol]: (id: string) => {
        const workspace = createMeetingWorkspace(id, {
          load: async () => ({ meeting: structuredClone(meeting), unlocked: true, collaborative: false }),
          complete: async () => meeting,
          updateText: async (_meetingId, target, value) => {
            await delayTextWrite;
            if (target.kind === 'general_notes') meeting.generalNotes = value;
            if (target.kind === 'opening_input') meeting.openingInput = value;
          },
        });
        return { workspace, opened: workspace.open(), operations: createMeetingRouteOperations(id, () => workspace.refresh(), (target, value) => workspace.updateText(target, value)) };
      } },
      stubs: { Select: false, RichTextEditor: editor, MeetingCollaborativeTextEditor: editor, TopicMoreOptions: true },
    },
  });
  await settle();
  const button = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('New meeting'));
  expect(button).toBeTruthy(); button!.click();
  if (!automatic) { await settle(); return; }
  await at('create-basics'); next(); await at('create-date');
  expect(document.querySelector('.driver-popover-next-btn')).toBeNull();
  const date = target('meeting-create-date').querySelector('input')!;
  date.value = '11/14/2026'; date.dispatchEvent(new Event('input', { bubbles: true }));
  await at('create-leader');
  await selectUser('meeting-create-leader'); await at('create-minute-taker');
  await selectUser('meeting-create-minute-taker'); await at('create-submit');
  await beforeSubmit?.();
  await click('meeting-create-submit');
  if (!sections.length) { await settle(); return; }
  await at('agenda-overview');
  next(); await at('sidebar-overview'); next(); await settle();
}
async function selectUser(id: string) {
  target(id).querySelector<HTMLElement>('.p-select')!.click(); await settle();
  document.querySelector<HTMLElement>('[role="option"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await settle();
}
async function sidebar() {
  await at('practice-preview'); await click('preparation-practice-preview');
  expect(tours.state.stepId).toBe('practice-preview');
  expect(tours.state.suspended).toBe(true);
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  const close = dialogs.at(-1)!.querySelector<HTMLButtonElement>('.p-dialog-close-button')!;
  expect(close).toBeTruthy(); close.click(); await at('practice-select');
  await click('preparation-practice-select'); await settle();
  // JSDOM has no layout. Supply actual viewport geometry for the visibility seam.
  vi.spyOn(target('preparation-topic-sidebar'), 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 700, height: 700 } as DOMRect);
  vi.spyOn(target('preparation-add-selected'), 'getBoundingClientRect').mockReturnValue({ top: 600, bottom: 650, height: 50 } as DOMRect);
  window.dispatchEvent(new Event('resize')); await at('practice-add-selection');
  await click('preparation-add-selected');
}
async function agenda(person = false) {
  if (!person) { await at('practice-duration'); next(); await at('practice-history-area'); next(); }
  await at('practice-context'); next(); await at('practice-drag'); next(); await at('practice-remove');
  await click('preparation-practice-remove');
}
async function details(save?: () => Promise<boolean | void>, editNote?: (note: HTMLTextAreaElement) => Promise<void>) {
  await at('details-open'); await click('preparation-edit-details'); await at('details-schedule');
  next(); await at('details-roles'); next(); await at('details-general-notes');
  const note = target('preparation-details-general-notes').querySelector('textarea')!;
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true);
  await editNote?.(note);
  note.value = 'Please bring the annual report.'; note.dispatchEvent(new Event('input', { bubbles: true }));
  await at('details-general-notes');
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(false);
  next();
  await at('details-save');
  if (save) {
    if (await save() === false) return;
  } else await click('preparation-details-save');
  await at('details-result');
  expect(target('preparation-general-notes-display').textContent).toContain('Please bring the annual report.');
  next(); await settle(); expect(tours.state.activeId).toBeNull();
}

// These full workflows mount real dialogs; CI coverage runs can exceed the unit-test budget.
describe('Meeting preparation tour through real view interactions', { timeout: 10_000 }, () => {
  beforeEach(() => {
    delayTextWrite = undefined;
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    HTMLElement.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = '<div id="meeting-workspace-status"></div>';
    setLanguage('en'); auth.completeInitialization(user); protectedText.state.status = 'unlocked';
    vi.spyOn(tourApi, 'list').mockResolvedValue([]);
    vi.spyOn(tourApi, 'record').mockResolvedValue({} as never);
  });
  afterEach(() => {
    stop?.(); wrapper?.unmount(); auth.completeInitialization(null); document.body.innerHTML = '';
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it('teaches the existing Topic path and retains the same Topic after removal and re-addition', async () => {
    await open(); await sidebar(); await agenda();
    await at('practice-reselect'); await click('preparation-practice-select'); await at('practice-readd');
    await click('preparation-add-selected'); await details();
    expect(api.createTopic).not.toHaveBeenCalled();
    expect(meeting.agenda!.map((item) => item.topicId)).toEqual(['real-topic']);
    expect(tourApi.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'complete', stepId: 'details-result' }), expect.anything());
  });
  it('creates one real Generic Topic on the empty path, then teaches the sidebar and saves notes', async () => {
    await open(null); await at('practice-create-open'); await click('preparation-create-topic'); await at('practice-create-name');
    const name = target('preparation-topic-name').querySelector('input')!;
    name.value = 'Annual planning'; name.dispatchEvent(new Event('input', { bubbles: true }));
    await at('practice-create-section'); next(); await at('practice-create-description'); next(); await at('practice-create-submit');
    await click('preparation-topic-create-submit'); await agenda(); await sidebar(); await details();
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    expect(tourApi.record).not.toHaveBeenCalledWith(expect.objectContaining({ tourId: 'new-topic-dialog' }), expect.anything());
    expect(meeting.agenda!.map((item) => item.topicId)).toEqual(['new-real-topic']);
  });
  it('uses Person notes without duration, history-area explanations, or forced Topic creation', async () => {
    await open('person'); await sidebar(); await agenda(true);
    await at('practice-reselect'); expect(api.createTopic).not.toHaveBeenCalled();
  });
  it('exits with a prerequisite message when no Agenda sections exist', async () => {
    await open(null, []);
    expect(tours.state.activeId).toBeNull();
    expect(document.body.textContent).toContain('Create an Agenda section');
    expect(api.createTopic).not.toHaveBeenCalled();
    expect(tourApi.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'complete' }), expect.anything());
  });
  it('offers no Skip or Escape shortcut and preserves saved data when navigating away after a failed removal', async () => {
    await open(); await sidebar();
    await at('practice-duration'); next(); await at('practice-history-area'); next();
    await at('practice-context'); next(); await at('practice-drag'); next(); await at('practice-remove');
    vi.mocked(api.removeMeetingTopic).mockRejectedValueOnce(new Error('Retry removal'));
    await click('preparation-practice-remove'); await at('practice-remove');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await at('practice-remove');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await at('practice-remove');
    await appRouter.push('/meetings');
    await settle();
    expect(tours.state.activeId).toBeNull();
    expect(meeting.agenda!.map((item) => item.topicId)).toEqual(['real-topic']);
    expect(topics).toHaveLength(1);
    expect(document.querySelector('.driver-overlay')).toBeNull();
  });
  it('cleans up on permission loss and does not complete the attempt', async () => {
    await open();
    auth.state.user = { ...user, permissions: { ...user.permissions, meetings: 'view' } };
    await settle();
    expect(tours.state.activeId).toBeNull();
    expect(document.querySelector('.driver-overlay')).toBeNull();
    expect(tourApi.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'complete' }), expect.anything());
  });

  it('suppresses a completed version automatically but opens the real creation dialog on manual replay', async () => {
    vi.mocked(tourApi.list).mockResolvedValue([{ tourId: 'meeting-preparation', version: 1, completedAt: '2026-11-07', state: 'completed' }]);
    await open('generic', [section], false);
    expect(tours.state.activeId).toBeNull();
    await tours.replay('meeting-preparation'); await at('create-basics');
    expect(target('meeting-create-submit')).toBeTruthy();
    expect(api.createMeeting).not.toHaveBeenCalled();
  });

  it('requires successful Meeting creation and leaves the submit step available after a failed write', async () => {
    await open('generic', [section], true, async () => {
      vi.mocked(api.createMeeting).mockRejectedValueOnce(new Error('Creation failed'));
      await click('meeting-create-submit'); await at('create-submit');
      expect(document.body.textContent).toContain('Creation failed');
      expect(api.addMeetingTopics).not.toHaveBeenCalled();
    });
    await at('practice-preview');
    expect(api.createMeeting).toHaveBeenCalledTimes(2);
  });
  it('waits for pending note writes and retries failed saves before exposing the result', async () => {
    await open(); await sidebar(); await agenda();
    await at('practice-reselect'); await click('preparation-practice-select'); await at('practice-readd');
    await click('preparation-add-selected');
    await details(async () => {
      vi.mocked(api.updateMeeting).mockRejectedValueOnce(new Error('Save failed'));
      await click('preparation-details-save'); await at('details-save');
      expect(target('preparation-details-general-notes')).toBeTruthy();
      let release!: () => void;
      delayTextWrite = new Promise<void>((resolve) => { release = resolve; });
      await click('preparation-details-save'); await at('details-save');
      expect(tourApi.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'complete' }), expect.anything());
      release(); await settle();
    });
  });

  it('blocks unrelated sidebar actions and dialogs until their own action step', async () => {
    await open('generic', [section], true, async () => {
      topics.push({ id: 'other-topic', name: 'Another discussion', type: 'generic', status: 'open' });
    });
    await at('practice-preview');
    await click('preparation-practice-select');
    expect(target('preparation-practice-select').getAttribute('aria-pressed')).toBe('false');
    await click('preparation-create-topic');
    expect(document.querySelector('#new-topic')).toBeNull();
    const otherPreview = Array.from(document.querySelectorAll<HTMLButtonElement>('.preview-trigger'))
      .find((button) => button.textContent?.includes('Another discussion'))!;
    otherPreview.click(); await settle();
    expect(tours.state.suspended).toBe(false);
    expect(document.querySelector('.p-dialog')).toBeNull();
    await at('practice-preview');
  });
  it('cancels immediately when the details dialog closes during an in-flight save', async () => {
    await open(); await sidebar(); await agenda();
    await at('practice-reselect'); await click('preparation-practice-select'); await at('practice-readd');
    await click('preparation-add-selected');
    await details(async () => {
      let release!: () => void;
      delayTextWrite = new Promise<void>((resolve) => { release = resolve; });
      await click('preparation-details-save'); await at('details-save');
      const dialog = document.querySelector('#edit-meeting-details')!.closest('[role="dialog"]')!;
      const cancel = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent === 'Cancel')!;
      cancel.click(); await settle();
      expect(tours.state.activeId).toBeNull();
      expect(document.querySelector('.driver-overlay')).toBeNull();
      release(); await settle();
      expect(tourApi.record).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'complete' }), expect.anything());
      expect(meeting.generalNotes).toContain('Please bring the annual report.');
      return false;
    });
  });
  it('applies edited Meeting values to the saved Meeting after reference loading fails', async () => {
    await open('generic', [section], true, async () => {
      vi.mocked(api.sections).mockRejectedValueOnce(new Error('Reference load failed'));
      await click('meeting-create-submit'); await at('create-submit');
      const title = target('meeting-create-basics').querySelector('input')!;
      title.value = 'Updated planning'; title.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    });
    expect(api.createMeeting).toHaveBeenCalledTimes(1);
    expect(meeting.title).toBe('Updated planning');
    expect(api.updateMeeting).toHaveBeenCalledWith('created-meeting', expect.objectContaining({ title: 'Updated planning' }));
  });

  it('updates a saved Topic on insertion retry without creating another Topic', async () => {
    await open(null); await at('practice-create-open'); await click('preparation-create-topic'); await at('practice-create-name');
    const name = target('preparation-topic-name').querySelector('input')!;
    name.value = 'Planning'; name.dispatchEvent(new Event('input', { bubbles: true }));
    await at('practice-create-section'); next(); await at('practice-create-description'); next(); await at('practice-create-submit');
    vi.mocked(api.addMeetingTopic).mockRejectedValueOnce(new Error('Insertion failed'));
    await click('preparation-topic-create-submit'); await at('practice-create-submit');
    name.value = 'Annual planning'; name.dispatchEvent(new Event('input', { bubbles: true })); await settle();
    await click('preparation-topic-create-submit'); await at('practice-duration');
    expect(api.createTopic).toHaveBeenCalledTimes(1);
    expect(api.updateTopic).toHaveBeenCalledWith('new-real-topic', expect.objectContaining({ name: 'Annual planning' }));
    expect(meeting.agenda!.map((item) => item.topicId)).toEqual(['new-real-topic']);
  });
  it('omits unsupported duration for New membership Topics while retaining the history explanation', async () => {
    await open('new_membership'); await sidebar(); await at('practice-history-area');
    expect(target('preparation-practice-history')).toBeTruthy();
    expect(target('preparation-practice-duration')).toBeNull();
    next(); await at('practice-context');
  });

  it('lets the user keep typing and requires Next after meaningful local note input', async () => {
    await open(); await sidebar(); await agenda();
    await at('practice-reselect'); await click('preparation-practice-select'); await at('practice-readd');
    await click('preparation-add-selected');
    await details(undefined, async (note) => {
      await vi.waitFor(() => expect(document.activeElement).toBe(note));
      const button = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await at('details-general-notes');
      for (const text of ['   ', '<p>&nbsp;</p>']) {
        note.value = text;
        note.dispatchEvent(new Event('input', { bubbles: true }));
        await at('details-general-notes');
        expect(button.disabled).toBe(true);
      }
      for (const text of ['A', 'A longer note that I can finish at my own pace.']) {
        note.value = text;
        note.dispatchEvent(new Event('input', { bubbles: true }));
        await at('details-general-notes');
        expect(button.disabled).toBe(false);
      }
      note.value = '';
      note.dispatchEvent(new Event('input', { bubbles: true }));
      await at('details-general-notes');
      expect(button.disabled).toBe(true);
    });
  });

});
