import {
  inject,
  onBeforeUnmount,
  provide,
  shallowRef,
  type InjectionKey,
} from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { protectedText } from "../../e2ee/protected-text";
import { createClosePrompt, closePromptKey } from "./close-prompt";
import { createMeetingWorkspace, type MeetingWorkspace, type MeetingWorkspaceState } from "./core";
import {
  createMeetingRouteOperations,
  productionMeetingWorkspaceBackend,
  type MeetingRouteOperations,
} from "./production-adapter";

const meetingWorkspaceKey: InjectionKey<MeetingWorkspace> = Symbol("meeting-workspace");

export interface MeetingRouteContext {
  workspace: MeetingWorkspace;
  operations: MeetingRouteOperations;
  opened: Promise<void>;
}

export const meetingRouteFactoryKey: InjectionKey<(meetingId: string) => MeetingRouteContext> =
  Symbol("meeting-route-factory");

export const useMeetingRoute = (meetingId: string): MeetingRouteContext => {
  const suppliedRoute = inject(meetingRouteFactoryKey, null)?.(meetingId);
  const core = suppliedRoute?.workspace
    ?? createMeetingWorkspace(meetingId, productionMeetingWorkspaceBackend);
  const state = shallowRef<MeetingWorkspaceState>(core.state);
  const unsubscribe = core.subscribe((next) => {
    state.value = next;
  });
  const workspace: MeetingWorkspace = {
    meetingId,
    get state() {
      return state.value;
    },
    open: () => core.open(),
    refresh: () => core.refresh(),
    text: (target) => core.text(target),
    updateText: (target, value) => core.updateText(target, value),
    complete: () => core.complete(),
    close: (options) => core.close(options),
    cancelClose: () => core.cancelClose(),
    forceClose: (reason) => core.forceClose(reason),
    subscribe: (listener) => core.subscribe(listener),
  };
  provide(meetingWorkspaceKey, workspace);
  useLifecycle(workspace);
  const opened = suppliedRoute?.opened ?? workspace.open();
  const operations = suppliedRoute?.operations ?? createMeetingRouteOperations(
    meetingId,
    () => workspace.refresh(),
    (target, value) => workspace.updateText(target, value),
  );
  onBeforeUnmount(() => {
    unsubscribe();
    if (workspace.state.phase !== "closed") workspace.forceClose("unmount");
  });
  return { workspace, operations, opened };
};

export const useMeetingWorkspace = (): MeetingWorkspace => {
  const workspace = inject(meetingWorkspaceKey);
  if (!workspace) throw new Error("MEETING_WORKSPACE_NOT_PROVIDED");
  return workspace;
};

export const tryUseMeetingWorkspace = (): MeetingWorkspace | null =>
  inject(meetingWorkspaceKey, null);

function useLifecycle(workspace: MeetingWorkspace): void {
  const prompt = createClosePrompt(workspace);
  provide(closePromptKey, prompt);
  onBeforeRouteLeave(() => prompt.close("navigation"));
  onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath || prompt.close("replacement"));
  const unbind = protectedText.bindWorkspaceLifecycle({
    close: () => prompt.close("lock"),
    forceClose: (reason) => {
      workspace.forceClose(reason);
      prompt.answer(false);
    },
  });
  onBeforeUnmount(() => {
    unbind();
    prompt.answer(false);
  });
}
