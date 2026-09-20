import {
  inject,
  onBeforeUnmount,
  provide,
  shallowRef,
  type InjectionKey,
} from "vue";
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
  if (suppliedRoute) {
    provide(meetingWorkspaceKey, suppliedRoute.workspace);
    return suppliedRoute;
  }
  const core = createMeetingWorkspace(meetingId, productionMeetingWorkspaceBackend);
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
    subscribe: (listener) => core.subscribe(listener),
  };
  provide(meetingWorkspaceKey, workspace);
  const opened = workspace.open();
  const operations = createMeetingRouteOperations(
    meetingId,
    () => workspace.refresh(),
    (target, value) => workspace.updateText(target, value),
  );
  onBeforeUnmount(() => {
    unsubscribe();
    void workspace.close({ reason: "navigation" });
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
