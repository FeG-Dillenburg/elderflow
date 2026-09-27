import { nextTick, reactive, watch, type WatchStopHandle } from 'vue';
import { auth } from '../auth/auth';
import type { Router } from 'vue-router';
import { protectedText } from '../e2ee/protected-text';
import type { TopicType } from '../topics/topicTypes';
import { tourRegistry, type TourDefinition, type TourId } from './registry';
import { tourApi, type TourEvent } from './tour-api';
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
  stopUnlock?: WatchStopHandle;
}
const state = reactive({ activeId: null as TourId | null, error: false, suspended: false, topicReplay: false });
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
  if (!step) { await finish(attempt, false); return; }
  const element = step.target ? await target(attempt, step.target) : undefined;
  if (!live(attempt) || active !== attempt) return;
  if (step.target && !element) {
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
  attempt.presenter.show(step, element, nextOption,
    attempt.index === attempt.definition.steps.length - 1,
    () => { void advance(attempt); }, () => { void finish(attempt, false); });
}

async function advance(attempt: Attempt): Promise<void> {
  if (!live(attempt) || active !== attempt || attempt.advancing) return;
  attempt.advancing = true;
  try {
    const step = attempt.definition.steps[attempt.index];
    if (attempt.index === attempt.definition.steps.length - 1) {
      await finish(attempt, true);
      return;
    }
    attempt.presenter.hide();
    attempt.index += 1;
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
  }
}

async function finish(attempt: Attempt, completed: boolean, redirect = true): Promise<void> {
  if (active !== attempt) return;
  attempt.abort.abort();
  attempt.stopUnlock?.();
  attempt.presenter.hide();
  state.suspended = false;
  // Keep the completion write ahead of the next trigger's eligibility read.
  await record(attempt, completed ? 'complete' : 'skip');
  if (active !== attempt) return;
  active = null;
  state.activeId = null;
  await nextTick();
  const currentTarget = attempt.definition.steps[attempt.index]?.target;
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
        void firstLogin();
      }, { flush: 'post', immediate: true },
    );
    const stopRoute = router.afterEach(() => {
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
      stopUser(); stopLogin(); stopRoute();
      window.removeEventListener('elderflow:before-logout', logout);
      reset();
    };
  },
  topicOpened(context: TopicContext): () => void {
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
    if (state.activeId) return;
    if (id === 'first-login') { await firstLogin(true); return; }
    await router.push('/topics');
    manualTopic = true;
    state.topicReplay = true;
  },
};
