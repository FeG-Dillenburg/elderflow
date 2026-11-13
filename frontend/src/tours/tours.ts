import { nextTick, reactive, watch, type WatchStopHandle } from 'vue';
import { deploymentUpdates } from '../deployment-updates/deployment-updates';
import { auth } from '../auth/auth';
import type { Router } from 'vue-router';
import { protectedText } from '../e2ee/protected-text';
import type { TopicType } from '../topics/topicTypes';
import { tourRegistry, type TourDefinition, type TourId } from './registry';
import { tourApi, type TourEvent } from './tour-api';
import { meetingPractice, nextMeetingStep, resetMeetingPractice } from './meeting-preparation';
import { TourPresenter } from './presenter';

interface TopicContext {
  root: HTMLElement;
  select(type: TopicType): void;
  isOpen(): boolean;
}
interface Attempt {
  definition: TourDefinition;
  userId: string;
  manual: boolean;
  context?: TopicContext;
  returnPath?: string;
  abort: AbortController;
  index: number;
  presenter: TourPresenter;
  writes: Promise<unknown>;
  advancing: boolean;
  presenting?: boolean;
  pendingAction?: string;
  inputReady?: boolean;
  expectedPath?: string;
  stopUnlock?: WatchStopHandle;
}
const state = reactive({ stepId: '' as string, meetingReplay: false, transitioning: false, activeId: null as TourId | null, error: false, suspended: false, topicReplay: false });
let router: Router;
let active: Attempt | null = null;
let queue: Attempt[] = [];
let generation = 0;
let internalNavigation = false;
let manualTopic = false;
let sessionAbort = new AbortController();

function live(attempt: Attempt): boolean {
  return !attempt.abort.signal.aborted && auth.state.user?.id === attempt.userId
    && attempt.definition.audience(auth.state.user)
    && (!attempt.context || attempt.context.isOpen());
}

function record(attempt: Attempt, event: TourEvent['event']): Promise<unknown> {
  const payload: TourEvent = {
    tourId: attempt.definition.id, version: attempt.definition.version,
    event, stepId: attempt.definition.steps[attempt.index]?.id,
  };
  const signal = sessionAbort.signal;
  attempt.writes = attempt.writes.then(() => {
    if (signal.aborted || auth.state.user?.id !== attempt.userId) return;
    return tourApi.record(payload, signal);
  }).catch(() => { if (!signal.aborted) state.error = true; });
  return attempt.writes;
}

async function target(attempt: Attempt, id: string): Promise<HTMLElement | undefined> {
  const deadline = Date.now() + 2000;
  do {
    if (!live(attempt)) return;
    await nextTick();
    const element = (attempt.context?.root ?? document).querySelector<HTMLElement>(`[data-tour-id="${id}"]`);
    if (element && !element.closest('[hidden], [aria-hidden="true"]')
      && getComputedStyle(element).display !== 'none') return element;
    await new Promise((resolve) => setTimeout(resolve, 40));
  } while (Date.now() < deadline);
}

async function show(attempt: Attempt): Promise<void> {
  if (!live(attempt) || active !== attempt) return;
  const step = attempt.definition.steps[attempt.index];
  attempt.presenting = true;
  attempt.inputReady = !step?.requiresInput;
  state.stepId = step?.id ?? '';
  if (!step) { await finish(attempt, false); return; }
  const marker = step.target ? await target(attempt, step.target) : undefined;
  const element = step.target?.startsWith('topic-type-')
    ? marker?.closest<HTMLButtonElement>('button') ?? marker : marker;
  if (!live(attempt) || active !== attempt) return;
  if (step.target && !element) {
    if (attempt.definition.id === 'meeting-preparation') {
      state.error = true;
      await finish(attempt, false);
      return;
    }
    // Missing targets can never implicitly complete a tour.
    attempt.index += 1;
    await show(attempt);
    return;
  }
  if (step.topicType) {
    attempt.context?.select(step.topicType);
    await nextTick();
  }
  void record(attempt, 'step');
  const next = attempt.definition.steps.slice(attempt.index + 1).find((candidate) =>
    candidate.target && attempt.context?.root.querySelector(`[data-tour-id="${candidate.target}"]`));
  const nextOption = next?.target
    ? attempt.context?.root.querySelector<HTMLElement>(`[data-tour-id="${next.target}"]`)?.closest<HTMLButtonElement>('button') ?? null : null;
  const advanceTarget = step.id === 'protected-text-passphrase' ? element ?? null : nextOption;
  const displayedStep = step.id === 'practice-context' && meetingPractice.person
    ? { ...step, descriptionKey: 'tours.meetingPersonContext' } : step;
  attempt.presenter.show(displayedStep, element, advanceTarget,
    attempt.index === attempt.definition.steps.length - 1,
    () => { if (step.mode !== 'action') void advance(attempt); }, () => { void finish(attempt, false); });
  attempt.presenter.setNextEnabled(Boolean(attempt.inputReady));
  attempt.presenting = false;
  if (attempt.pendingAction && !attempt.advancing) {
    const pending = attempt.pendingAction;
    attempt.pendingAction = undefined;
    tours.meetingAction(pending);
  }
}

async function advance(attempt: Attempt): Promise<void> {
  if (!live(attempt) || active !== attempt || attempt.advancing) return;
  attempt.advancing = true;
  try {
    const step = attempt.definition.steps[attempt.index];
    if (step.requiresInput && !attempt.inputReady) return;
    if (attempt.index === attempt.definition.steps.length - 1) {
      await finish(attempt, true);
      return;
    }
    attempt.presenter.hide();
    if (attempt.definition.id === 'meeting-preparation') {
      const nextId = nextMeetingStep(step.id);
      attempt.index = attempt.definition.steps.findIndex((candidate) => candidate.id === nextId);
    } else attempt.index += 1;
    if (step.id === 'welcome') protectedText.showUnlock();
    if (step.id === 'protected-text-passphrase' && protectedText.state.promptVisible) {
      state.suspended = true;
      await nextTick();
      document.querySelector<HTMLElement>('[data-tour-id="unlock-passphrase"]')?.focus();
      attempt.stopUnlock = watch(() => protectedText.state.promptVisible, (visible) => {
        if (visible) return;
        attempt.stopUnlock?.();
        state.suspended = false;
        void show(attempt).catch(() => finish(attempt, false));
      }, { flush: 'post' });
      return;
    }
    await show(attempt);
  } catch {
    state.error = true;
    await finish(attempt, false);
  } finally {
    attempt.advancing = false;
    const pending = attempt.pendingAction;
    attempt.pendingAction = undefined;
    if (pending) tours.meetingAction(pending);
  }
}

async function finish(attempt: Attempt, completed: boolean, redirect = true): Promise<void> {
  if (active !== attempt || attempt.abort.signal.aborted) return;
  attempt.abort.abort();
  attempt.stopUnlock?.();
  attempt.presenter.hide();
  state.suspended = false;
  state.transitioning = false;
  // Keep the completion write ahead of the next trigger's eligibility read.
  await record(attempt, completed ? 'complete' : 'skip');
  if (active !== attempt) return;
  if (completed && attempt.context?.isOpen()) attempt.context.select('generic');
  active = null;
  state.activeId = null;
  state.stepId = '';
  resetMeetingPractice();
  await nextTick();
  const currentTarget = completed && attempt.context ? 'topic-type-generic' : attempt.definition.steps[attempt.index]?.target;
  const formFocus = currentTarget && attempt.context?.isOpen()
    ? attempt.context.root.querySelector(`[data-tour-id="${currentTarget}"]`)?.closest('button') ?? undefined
    : undefined;
  attempt.presenter.destroy(formFocus);
  if (redirect && attempt.returnPath && auth.state.user?.id === attempt.userId) {
    internalNavigation = true;
    try { await router.replace(attempt.returnPath); } finally { internalNavigation = false; }
  }
  void drain();
}

async function drain(): Promise<void> {
  if (active) return;
  const attempt = queue.shift();
  if (!attempt) return;
  if (!live(attempt)) { void drain(); return; }
  active = attempt;
  state.activeId = attempt.definition.id;
  try {
    const progress = await tourApi.list(sessionAbort.signal);
    if (!live(attempt) || active !== attempt) return;
    if (!attempt.manual && progress.some((entry) => entry.tourId === attempt.definition.id
      && entry.version === attempt.definition.version && entry.completedAt)) {
      active = null;
      state.activeId = null;
      attempt.presenter.destroy();
      void drain();
      return;
    }
    await record(attempt, 'start');
    if (!live(attempt) || active !== attempt) return;
    if (attempt.context) attempt.context.select('generic');
    await show(attempt);
  } catch {
    if (active === attempt) {
      state.error = true;
      await finish(attempt, false);
    }
  }
}

function enqueue(id: TourId, options: { manual?: boolean; context?: TopicContext; returnPath?: string } = {}): void {
  const user = auth.state.user;
  const definition = tourRegistry[id];
  if (!user || !definition.audience(user)) return;
  queue.push({ definition, userId: user.id, manual: options.manual ?? false,
    context: options.context, returnPath: options.returnPath, abort: new AbortController(),
    presenter: new TourPresenter(), index: 0, writes: Promise.resolve(), advancing: false });
  void drain();
}

function reset(): void {
  deploymentUpdates.reset();
  generation += 1;
  sessionAbort.abort();
  sessionAbort = new AbortController();
  queue.forEach((attempt) => { attempt.abort.abort(); attempt.presenter.destroy(); });
  queue = [];
  active?.abort.abort();
  active?.stopUnlock?.();
  active?.presenter.destroy();
  active = null;
  manualTopic = false;
  state.activeId = null;
  state.suspended = false;
  state.error = false;
  state.topicReplay = false;
  state.meetingReplay = false;
  state.transitioning = false;
  state.stepId = '';
  resetMeetingPractice();
}

async function firstLogin(manual = false): Promise<void> {
  const user = auth.state.user;
  if (!user || !tourRegistry['first-login'].audience(user)) return;
  const currentGeneration = generation;
  const returnPath = router.currentRoute.value.fullPath;
  try {
    const progress = await tourApi.list(sessionAbort.signal);
    if (currentGeneration !== generation || auth.state.user?.id !== user.id) return;
    if (!manual && progress.some((entry) => entry.tourId === 'first-login' && entry.version === 1 && entry.completedAt)) {
      protectedText.showUnlock();
      return;
    }
    protectedText.skip();
    internalNavigation = true;
    try { await router.replace('/'); } finally { internalNavigation = false; }
    if (currentGeneration !== generation || auth.state.user?.id !== user.id) return;
    enqueue('first-login', { manual: true, returnPath });
  } catch {
    if (currentGeneration === generation) {
      state.error = true;
      protectedText.showUnlock();
    }
  }
}

export const tours = {
  state,
  mount(appRouter: Router): () => void {
    router = appRouter;
    const stopUser = watch(() => [auth.state.user?.id, auth.state.user?.role], reset, { flush: 'sync' });
    const stopLogin = watch(
      () => [auth.state.loginPending, router.currentRoute.value.fullPath],
      () => {
        if (!auth.state.loginPending || router.currentRoute.value.meta.public || !auth.state.user) return;
        auth.state.loginPending = false;
        const currentGeneration = generation;
        const restored = auth.state.sessionRestored;
        void deploymentUpdates.beforeLogin().then(() => {
          if (currentGeneration !== generation || !auth.state.user) return;
          if (restored) {
            if (protectedText.isEligible(auth.state.user)) protectedText.showUnlock();
          } else void firstLogin();
        });
      }, { flush: 'post', immediate: true },
    );
    const stopAccess = watch(() => [protectedText.state.status, auth.state.user?.permissions], () => {
      if (active?.definition.id === 'meeting-preparation'
        && (protectedText.state.status !== 'unlocked' || !live(active))) void finish(active, false, false);
    }, { deep: true });
    const stopRoute = router.afterEach((to) => {
      if (active?.definition.id === 'meeting-preparation' && active.expectedPath === to.path) {
        active.expectedPath = undefined;
        return;
      }
      if (internalNavigation) return;
      queue.forEach((attempt) => attempt.abort.abort());
      queue = [];
      if (active) void finish(active, false, false);
    });
    const logout = () => {
      if (!active) return;
      // Start with the outgoing token before auth clears it; identity teardown
      // must not cancel this final, already-attributed request.
      void tourApi.record({ tourId: active.definition.id, version: active.definition.version,
        event: 'skip', stepId: active.definition.steps[active.index]?.id }).catch(() => undefined);
    };
    window.addEventListener('elderflow:before-logout', logout);
    return () => {
      stopUser(); stopLogin(); stopRoute(); stopAccess();
      window.removeEventListener('elderflow:before-logout', logout);
      reset();
    };
  },
  meetingOpened(): void {
    if (state.activeId || protectedText.state.status !== 'unlocked'
      || deploymentUpdates.state.blocking || deploymentUpdates.state.visible) return;
    resetMeetingPractice();
    const manual = state.meetingReplay;
    state.meetingReplay = false;
    enqueue('meeting-preparation', { manual });
  },
  meetingAction(stepId: string): void {
    const attempt = active;
    if (!attempt || attempt.definition.id !== 'meeting-preparation' || state.suspended
      || attempt.definition.steps[attempt.index]?.id !== stepId
      || attempt.definition.steps[attempt.index]?.mode !== 'action') return;
    if (attempt.advancing || attempt.presenting) { attempt.pendingAction = stepId; return; }
    if (stepId === 'create-submit') state.transitioning = false;
    void advance(attempt);
  },
  meetingInput(stepId: string, ready: boolean): void {
    const attempt = active;
    if (!attempt || !live(attempt) || attempt.definition.id !== 'meeting-preparation'
      || attempt.definition.steps[attempt.index]?.id !== stepId
      || !attempt.definition.steps[attempt.index]?.requiresInput) return;
    attempt.inputReady = ready;
    attempt.presenter.setNextEnabled(ready);
  },
  meetingSignal(): AbortSignal | undefined {
    return active?.definition.id === 'meeting-preparation' ? active.abort.signal : undefined;
  },
  meetingCreated(meetingId: string): void {
    if (active?.definition.id === 'meeting-preparation' && state.stepId === 'create-submit') {
      active.expectedPath = `/meetings/${meetingId}/prepare`;
      state.transitioning = true;
      active.presenter.hide();
    }
  },
  meetingPreview(open: boolean): void {
    if (active?.definition.id !== 'meeting-preparation' || state.stepId !== 'practice-preview') return;
    state.suspended = open;
    if (open) active.presenter.hide();
    else { state.suspended = false; tours.meetingAction('practice-preview'); }
  },
  cancelMeeting(): void {
    if (active?.definition.id === 'meeting-preparation') void finish(active, false, false);
  },
  topicOpened(context: TopicContext): () => void {
    if (state.activeId === 'meeting-preparation' || deploymentUpdates.state.blocking || deploymentUpdates.state.visible) return () => undefined;
    const manual = manualTopic;
    manualTopic = false;
    enqueue('new-topic-dialog', { context, manual });
    return () => {
      queue = queue.filter((attempt) => attempt.context !== context);
      if (active?.context === context) void finish(active, false, false);
    };
  },
  recovery(): void {
    if (active?.definition.id === 'first-login') void finish(active, false, false);
  },
  async replay(id: TourId): Promise<void> {
    if (state.activeId || deploymentUpdates.state.blocking || deploymentUpdates.state.visible) return;
    if (id === 'first-login') { await firstLogin(true); return; }
    if (id === 'meeting-preparation') {
      if (protectedText.state.status !== 'unlocked') return;
      const currentGeneration = generation;
      state.meetingReplay = false;
      await router.push('/meetings');
      if (currentGeneration !== generation || router.currentRoute.value.path !== '/meetings'
        || protectedText.state.status !== 'unlocked' || state.activeId
        || deploymentUpdates.state.blocking || deploymentUpdates.state.visible) return;
      state.meetingReplay = true;
      return;
    }
    await router.push('/topics');
    manualTopic = true;
    state.topicReplay = true;
  },
};
