import {
  api,
  type MeetingTopic,
  type Topic,
  type TopicFieldPatch,
} from "../api/domain";

export const saveMeetingTopicNote =
  (meetingId: string, item: MeetingTopic) =>
  async (agendaNote: string | null): Promise<MeetingTopic> => {
    const saved = await api.updateMeetingTopicNote(meetingId, item.id, agendaNote);
    item.agendaNote = saved.agendaNote;
    return saved;
  };

export const saveMeetingTopicField =
  (meetingId: string, item: MeetingTopic) =>
  async (patch: TopicFieldPatch): Promise<Topic> => {
    const saved = await api.updateMeetingTopicFields(meetingId, item.id, patch);
    if (item.topic) Object.assign(item.topic, saved);
    return saved;
  };
