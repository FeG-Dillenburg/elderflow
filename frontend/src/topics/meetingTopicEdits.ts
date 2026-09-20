import {
  type MeetingTopic,
  type StructuralTopicFieldPatch,
  type Topic,
  type TopicFieldPatch,
} from "../api/domain";
import type { MeetingRouteOperations } from "../meetings/workspace";

export const saveMeetingTopicField =
  (operations: MeetingRouteOperations, item: MeetingTopic) =>
  async (patch: TopicFieldPatch): Promise<Topic> => {
    const structuralPatch: StructuralTopicFieldPatch = {};
    if (patch.responsibleUserId !== undefined) {
      structuralPatch.responsibleUserId = patch.responsibleUserId;
    }
    if (patch.membershipStatusSignal !== undefined) {
      structuralPatch.membershipStatusSignal = patch.membershipStatusSignal;
    }
    const protectedPatch: Partial<TopicFieldPatch> = {};
    if (patch.membershipProcessStatus !== undefined) {
      protectedPatch.membershipProcessStatus = patch.membershipProcessStatus;
    }
    if (patch.godparents !== undefined) {
      protectedPatch.godparents = patch.godparents;
    }

    const hasStructuralFields = Object.keys(structuralPatch).length > 0;
    const hasProtectedFields = Object.keys(protectedPatch).length > 0;
    let saved = hasStructuralFields || !hasProtectedFields
      ? await operations.updateTopicFields(item.id, structuralPatch)
      : await operations.updateTopic(item.topicId, protectedPatch);
    if (hasStructuralFields && hasProtectedFields) {
      saved = await operations.updateTopic(item.topicId, protectedPatch);
    }
    return saved;
  };
