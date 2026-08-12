import {
  api,
  type MeetingAppearanceTexts,
  type MeetingTopic,
  type StructuralTopicFieldPatch,
  type Topic,
  type TopicFieldPatch,
} from "../api/domain";

const applyAppearanceTexts = (
  item: MeetingTopic,
  saved: MeetingAppearanceTexts,
): void => {
  item.preparationContext = saved.preparationContext;
  item.personNote = saved.personNote;
  item.meetingMinutes = saved.meetingMinutes;
};

export const saveMeetingPreparationContext =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const version = item.preparationContext?.version ?? 0;
    const saved = await api.updateMeetingPreparationContext(
      meetingId,
      item.id,
      { text, version },
    );
    applyAppearanceTexts(item, saved);
    return item;
  };

export const savePersonMeetingNote =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const version = item.personNote?.version ?? 0;
    const saved = await api.updatePersonMeetingNote(
      meetingId,
      item.id,
      { text, version },
    );
    applyAppearanceTexts(item, saved);
    return item;
  };

export const saveMeetingMinutes =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const saved = await api.updateMeetingMinutes(meetingId, item.id, {
      text: text ?? "",
      version: item.meetingMinutes?.version ?? null,
    });
    applyAppearanceTexts(item, saved);
    return item;
  };

export const saveMeetingTopicField =
  (meetingId: string, item: MeetingTopic) =>
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
      ? await api.updateMeetingTopicFields(meetingId, item.id, structuralPatch)
      : await api.updateTopic(item.topicId, protectedPatch);
    if (hasStructuralFields && hasProtectedFields) {
      saved = await api.updateTopic(item.topicId, protectedPatch);
    }
    if (item.topic) {
      Object.assign(item.topic, saved);
    }
    return saved;
  };
