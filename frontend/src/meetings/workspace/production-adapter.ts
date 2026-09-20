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
import { protectedText } from "../../e2ee/protected-text";
import type {
  MeetingWorkspaceBackend,
  MeetingWorkspaceCollaboration,
  MeetingWorkspacePhase,
} from "./core";
import { startMeetingCollaboration, updateMeetingText } from "./infrastructure";

const phaseFor = (status: CollaborationStatus): MeetingWorkspacePhase => {
  if (status === "offline") return "temporarily_offline";
  if (status === "connecting" || status === "pending" || status === "paused"
    || status === "resynchronizing") return "syncing";
  if (status === "rejected" || status === "discarded") return "unavailable";
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
      return phaseFor(provider.status) as MeetingWorkspaceCollaboration["phase"];
    },
    get pending() {
      return provider.hasPendingChanges?.() ?? false;
    },
    get collaborators() {
      return collaborators();
    },
    subscribe(listener) {
      const stateChanged = () => listener("state");
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
    async complete() {
      if (!(await provider.readyForCompletion())) {
        throw new Error("MEETING_WORKSPACE_PENDING_CHANGES");
      }
    },
  };
};

export const productionMeetingWorkspaceBackend: MeetingWorkspaceBackend = {
  async load(meetingId) {
    const meeting = await api.meeting(meetingId, { strictWorkspace: true });
    await startMeetingCollaboration(meeting);
    return {
      meeting,
      unlocked: protectedText.state.status === "unlocked",
      collaborative: Boolean(meeting.workspace),
    };
  },
  async connect(meetingId) {
    return collaborationFor(meetingId);
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
