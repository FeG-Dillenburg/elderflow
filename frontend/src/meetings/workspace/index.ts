export {
  createMeetingWorkspace,
  type MeetingTextBinding,
  type MeetingTextTarget,
  type MeetingWorkspace,
  type MeetingWorkspaceBackend,
  type MeetingWorkspaceCollaboration,
  type MeetingWorkspaceCollaborator,
  type MeetingWorkspacePhase,
  type MeetingWorkspaceState,
} from "./core";
export {
  meetingRouteFactoryKey,
  tryUseMeetingWorkspace,
  useMeetingRoute,
  useMeetingWorkspace,
  type MeetingRouteContext,
} from "./vue";
export { default as MeetingCollaborativeTextEditor } from "./MeetingCollaborativeTextEditor.vue";
export type { MeetingRouteOperations } from "./production-adapter";
