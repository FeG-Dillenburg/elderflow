import {
  api,
  type MeetingAppearanceTexts,
  type MeetingTopic,
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
    const version = item.preparationContext?.version ?? item.noteVersion ?? 0;
    const saved = await api.updateMeetingPreparationContext(
      meetingId,
      item.id,
      { text, version },
    );
    applyAppearanceTexts(item, saved);
    item.agendaNote = saved.preparationContext?.text ?? null;
    item.noteVersion = saved.preparationContext?.version ?? version + 1;
    return item;
  };

export const savePersonMeetingNote =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const version = item.personNote?.version ?? item.noteVersion ?? 0;
    const saved = await api.updatePersonMeetingNote(
      meetingId,
      item.id,
      { text, version },
    );
    applyAppearanceTexts(item, saved);
    item.agendaNote = saved.personNote?.text ?? null;
    item.noteVersion = saved.personNote?.version ?? version + 1;
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
    const saved = await api.updateMeetingTopicFields(meetingId, item.id, patch);
    if (item.topic) Object.assign(item.topic, saved);
    return saved;
  };
