import { api, type MeetingTopic } from "../api/domain";

export const saveMeetingTopicNote =
  (meetingId: string, item: MeetingTopic) =>
  async (agendaNote: string | null): Promise<MeetingTopic> => {
    const saved = await api.updateMeetingTopicNote(meetingId, item.id, agendaNote);
    item.agendaNote = saved.agendaNote;
    return saved;
  };
