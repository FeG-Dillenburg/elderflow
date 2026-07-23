import {
  api,
  type MeetingTopic,
  type Topic,
  type TopicFieldPatch,
} from "../api/domain";

export const saveMeetingPreparationContext =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const version = item.preparationContext?.version ?? item.noteVersion ?? 0;
    const saved = await api.updateMeetingPreparationContext(
      meetingId,
      item.id,
      { text, version },
    );
    item.agendaNote = saved.agendaNote;
    item.noteVersion = saved.noteVersion;
    item.preparationContext = {
      id: item.id,
      text: saved.agendaNote,
      version: saved.noteVersion ?? version + 1,
    };
    return saved;
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
    item.agendaNote = saved.agendaNote;
    item.noteVersion = saved.noteVersion;
    item.personNote = {
      id: item.id,
      text: saved.agendaNote,
      version: saved.noteVersion ?? version + 1,
    };
    return saved;
  };

export const saveMeetingMinutes =
  (meetingId: string, item: MeetingTopic) =>
  async (text: string | null): Promise<MeetingTopic> => {
    const saved = await api.updateMeetingMinutes(meetingId, item.id, {
      text: text ?? "",
      version: item.meetingMinutes?.version ?? null,
    });
    item.meetingMinutes = saved;
    return item;
  };

export const saveMeetingTopicField =
  (meetingId: string, item: MeetingTopic) =>
  async (patch: TopicFieldPatch): Promise<Topic> => {
    const saved = await api.updateMeetingTopicFields(meetingId, item.id, patch);
    if (item.topic) Object.assign(item.topic, saved);
    return saved;
  };
