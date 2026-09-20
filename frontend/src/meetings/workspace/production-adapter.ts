import {
  api,
  type Meeting,
  type MeetingInput,
  type MeetingParticipant,
  type MeetingTopic,
  type MeetingTopicAddition,
  type StructuralTopicFieldPatch,
  type Topic,
} from "../../api/domain";
import { isCollaboratorPresentation } from "../../e2ee/collaborator-presentation";
import { meetingCollaboration, type CollaborationStatus } from "../../e2ee/meeting-collaboration";
import { meetingDocumentSession } from "../../e2ee/meeting-document-session";
import { protectedText } from "../../e2ee/protected-text";
import type {
  MeetingWorkspaceBackend,
  MeetingWorkspaceCollaboration,
  MeetingWorkspacePhase,
} from "./core";
import { startMeetingCollaboration, updateMeetingText } from "./infrastructure";

const phaseFor = (status: CollaborationStatus, connected: boolean, initialConnectionPending: boolean): MeetingWorkspacePhase => {
  if (status === "rejected" || status === "discarded") return "unavailable";
  if (!connected && initialConnectionPending) return "opening";
  if (status === "offline" || !connected) return "temporarily_offline";
  if (status === "connecting" || status === "pending" || status === "paused"
    || status === "resynchronizing") return "syncing";
  return "ready";
};

const collaborationFor = (meetingId: string): MeetingWorkspaceCollaboration => {
  const provider = meetingCollaboration.get(meetingId);
  if (!provider) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
  const collaborators = () => [...provider.awareness.getStates().values()]
    .flatMap((state) => isCollaboratorPresentation(state.user)
      ? [state.user]
      : []);
  return {
    get phase() {
      return phaseFor(provider.status, provider.isConnected(), provider.isInitialConnectionPending()) as MeetingWorkspaceCollaboration["phase"];
    },
    get editingPaused() {
      return provider.isEditingPaused();
    },
    get failure() {
      if (provider.terminalCode === "MEETING_COMPLETED_IMMUTABLE") return "completed";
      return provider.status === "discarded" ? "access" : provider.status === "rejected" ? "integrity" : undefined;
    },
    get pending() {
      return provider.hasPendingChanges?.() ?? false;
    },
    get collaborators() {
      return collaborators();
    },
    subscribe(listener) {
      const stateChanged = () => {
        listener("state");
        if (provider.status === "discarded" && provider.terminalCode !== "MEETING_COMPLETED_IMMUTABLE") protectedText.lock("authorization-loss");
      };
      provider.addEventListener("status", stateChanged);
      const presenceChanged = () => listener("presence");
      provider.awareness.on("change", presenceChanged);
      const documentChanged = () => listener("document");
      provider.document?.on("updateV2", documentChanged);
      return () => {
        provider.removeEventListener("status", stateChanged);
        provider.awareness.off("change", presenceChanged);
        provider.document?.off("updateV2", documentChanged);
      };
    },
    close() {
      meetingCollaboration.stop(meetingId);
    },
  };
};

export const productionMeetingWorkspaceBackend: MeetingWorkspaceBackend = {
  async load(meetingId, signal) {
    const meeting = await api.meeting(meetingId, { strictWorkspace: true, signal });
    signal?.throwIfAborted();
    if (protectedText.state.status === "unlocked" && !meeting.workspace) {
      throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
    }
    await startMeetingCollaboration(meeting);
    signal?.throwIfAborted();
    return {
      meeting,
      unlocked: protectedText.state.status === "unlocked",
      collaborative: Boolean(meeting.workspace),
    };
  },
  revokeAccess() {
    protectedText.lock("authorization-loss");
  },
  dispose(meetingId) {
    meetingCollaboration.stop(meetingId);
    meetingDocumentSession.discard(meetingId);
  },
  readText(meeting) {
    const fragments = meetingDocumentSession.hydrateFragments(meeting.id,
      (meeting.agenda ?? []).map((item) => ({ id: item.id, person: item.topic?.type === "person" })));
    return {
      ...meeting,
      generalNotes: fragments.generalNotes,
      openingInput: fragments.openingInput,
      agenda: meeting.agenda?.map((item) => {
        const values = fragments.appearances.get(item.id)!;
        return { ...item,
          preparationContext: values.preparationContext === null ? null : { id: item.id, text: values.preparationContext, version: 0 },
          personNote: values.personNote === null ? null : { id: item.id, text: values.personNote, version: 0 },
          meetingMinutes: values.meetingMinutes === null ? null : { id: item.id, text: values.meetingMinutes, version: 0 },
        };
      }),
    };
  },
  async connect(meetingId) {
    const collaboration = collaborationFor(meetingId);
    if (collaboration.failure === "access") protectedText.lock("authorization-loss");
    return collaboration;
  },
  complete: (meetingId) => api.completeMeeting(meetingId),
  async updateText(meetingId, target, value) {
    await updateMeetingText(meetingId, target, value);
  },
};

export interface MeetingRouteOperations {
  updateMeeting(input: Partial<MeetingInput>): Promise<Meeting>;
  addParticipant(input: { userId: string; attendanceStatus: string }): Promise<MeetingParticipant>;
  removeParticipant(userId: string): Promise<void>;
  addTopic(input: MeetingTopicAddition): Promise<MeetingTopic>;
  addTopics(inputs: MeetingTopicAddition[]): Promise<MeetingTopic[]>;
  removeTopic(appearanceId: string): Promise<void>;
  reorderAgenda(items: Array<{ id: string; sectionId: string; position: number }>): Promise<MeetingTopic[]>;
  updateAppearance(item: MeetingTopic, options?: { deferred?: boolean }): Promise<MeetingTopic>;
  updateTopicFields(appearanceId: string, input: StructuralTopicFieldPatch): Promise<Topic>;
  updateTopic(topicId: string, input: Partial<import("../../api/domain").TopicInput>): Promise<Topic>;
}

export const createMeetingRouteOperations = (
  meetingId: string,
  refresh: () => Promise<void>,
  updateText?: (target: import("./core").MeetingTextTarget, value: string) => Promise<void>,
): MeetingRouteOperations => {
  const mutate = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = await operation();
    await refresh();
    return result;
  };
  return {
    updateMeeting: async (input) => {
      const { generalNotes, openingInput, ...structural } = input;
      if (updateText && generalNotes !== undefined) {
        await updateText({ kind: "general_notes" }, generalNotes ?? "");
      }
      if (updateText && openingInput !== undefined) {
        await updateText({ kind: "opening_input" }, openingInput ?? "");
      }
      return mutate(() => api.updateMeeting(meetingId, structural));
    },
    addParticipant: (input) => mutate(() => api.addParticipant(meetingId, input)),
    removeParticipant: (userId) => mutate(() => api.removeParticipant(meetingId, userId)),
    addTopic: (input) => mutate(() => api.addMeetingTopic(meetingId, input)),
    addTopics: (inputs) => mutate(() => api.addMeetingTopics(meetingId, inputs)),
    removeTopic: (appearanceId) => mutate(() => api.removeMeetingTopic(meetingId, appearanceId)),
    reorderAgenda: (items) => mutate(() => api.reorderMeetingTopics(meetingId, items)),
    updateAppearance: (item, options) => mutate(() => options
      ? api.updateMeetingTopic(meetingId, item, options)
      : api.updateMeetingTopic(meetingId, item)),
    updateTopicFields: (appearanceId, input) => mutate(() =>
      api.updateMeetingTopicFields(meetingId, appearanceId, input)),
    updateTopic: (topicId, input) => mutate(() => api.updateTopic(topicId, input)),
  };
};
