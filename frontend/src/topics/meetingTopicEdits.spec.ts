import { describe, expect, it, vi } from "vitest";
import { api, type MeetingTopic } from "../api/domain";
import {
  saveMeetingMinutes,
  saveMeetingPreparationContext,
  savePersonMeetingNote,
} from "./meetingTopicEdits";

const item = (): MeetingTopic => ({
  id: "appearance",
  meetingId: "meeting",
  topicId: "topic",
  sectionId: "section",
  position: 1,
  agendaNote: "legacy",
  plannedDuration: null,
  status: "planned",
  preparationContext: { id: "appearance", text: "Context", version: 2 },
  personNote: null,
  meetingMinutes: null,
});

describe("semantic Meeting text saves", () => {
  it("sends the current preparation version and advances local state from the response", async () => {
    const appearance = item();
    vi.spyOn(api, "updateMeetingPreparationContext").mockResolvedValue({
      preparationContext: {
        id: "appearance",
        text: "Revised context",
        version: 3,
      },
      personNote: null,
      meetingMinutes: null,
    });

    await saveMeetingPreparationContext("meeting", appearance)("Revised context");

    expect(api.updateMeetingPreparationContext).toHaveBeenCalledWith(
      "meeting",
      "appearance",
      { text: "Revised context", version: 2 },
    );
    expect(appearance.preparationContext).toEqual({
      id: "appearance",
      text: "Revised context",
      version: 3,
    });
  });

  it("uses the Person note endpoint and keeps Person semantics separate", async () => {
    const appearance = {
      ...item(),
      preparationContext: null,
      personNote: { id: "appearance", text: "Earlier", version: 1 },
    };
    vi.spyOn(api, "updatePersonMeetingNote").mockResolvedValue({
      preparationContext: null,
      personNote: { id: "appearance", text: "Current", version: 2 },
      meetingMinutes: null,
    });

    await savePersonMeetingNote("meeting", appearance)("Current");

    expect(appearance.personNote).toMatchObject({ text: "Current", version: 2 });
    expect(appearance.meetingMinutes).toBeNull();
  });

  it("creates then versions the one current Meeting-minutes value", async () => {
    const appearance = item();
    vi.spyOn(api, "updateMeetingMinutes").mockResolvedValue({
      preparationContext: appearance.preparationContext ?? null,
      personNote: null,
      meetingMinutes: {
        id: "minute",
        text: "Recorded",
        version: 1,
      },
    });

    await saveMeetingMinutes("meeting", appearance)("Recorded");

    expect(api.updateMeetingMinutes).toHaveBeenCalledWith(
      "meeting",
      "appearance",
      { text: "Recorded", version: null },
    );
    expect(appearance.meetingMinutes).toEqual({
      id: "minute",
      text: "Recorded",
      version: 1,
    });
  });
});
