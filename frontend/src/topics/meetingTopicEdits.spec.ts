import { describe, expect, it, vi } from "vitest";
import { api, type MeetingTopic } from "../api/domain";
import {
  saveMeetingMinutes,
  saveMeetingPreparationContext,
  saveMeetingTopicField,
  savePersonMeetingNote,
} from "./meetingTopicEdits";

const item = (): MeetingTopic => ({
  id: "appearance",
  meetingId: "meeting",
  topicId: "topic",
  sectionId: "section",
  position: 1,
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

  it("routes Protected Topic fields through the encrypted Topic update path", async () => {
    const topic = {
      id: "topic",
      membershipProcessStatus: "Earlier",
      godparents: null,
    } as any;
    const appearance = { ...item(), topic };
    vi.spyOn(api, "updateTopic").mockResolvedValue({
      ...topic,
      membershipProcessStatus: "Current",
    });
    const appearanceUpdate = vi.spyOn(api, "updateMeetingTopicFields");

    await saveMeetingTopicField("meeting", appearance)({
      membershipProcessStatus: "Current",
    });

    expect(api.updateTopic).toHaveBeenCalledWith("topic", {
      membershipProcessStatus: "Current",
    });
    expect(appearanceUpdate).not.toHaveBeenCalled();
    expect(appearance.topic?.membershipProcessStatus).toBe("Current");
  });

  it("keeps structural inline fields on the Meeting mutation boundary", async () => {
    const topic = { id: "topic", responsibleUserId: null } as any;
    const appearance = { ...item(), topic };
    vi.spyOn(api, "updateMeetingTopicFields").mockResolvedValue({
      ...topic,
      responsibleUserId: "user",
    });
    const topicUpdate = vi.spyOn(api, "updateTopic");

    await saveMeetingTopicField("meeting", appearance)({
      responsibleUserId: "user",
    });

    expect(api.updateMeetingTopicFields).toHaveBeenCalledWith(
      "meeting",
      "appearance",
      { responsibleUserId: "user" },
    );
    expect(topicUpdate).not.toHaveBeenCalled();
  });

  it("partitions mixed runtime input without bypassing the Meeting boundary", async () => {
    const topic = { id: "topic", responsibleUserId: null, godparents: null } as any;
    const appearance = { ...item(), topic };
    const structuralUpdate = vi.spyOn(api, "updateMeetingTopicFields").mockResolvedValue({
      ...topic,
      responsibleUserId: "user",
    });
    const protectedUpdate = vi.spyOn(api, "updateTopic").mockResolvedValue({
      ...topic,
      responsibleUserId: "user",
      godparents: "Ada",
    });

    await saveMeetingTopicField("meeting", appearance)({
      responsibleUserId: "user",
      godparents: "Ada",
    } as any);

    expect(api.updateMeetingTopicFields).toHaveBeenCalledWith(
      "meeting",
      "appearance",
      { responsibleUserId: "user" },
    );
    expect(api.updateTopic).toHaveBeenCalledWith("topic", {
      godparents: "Ada",
    });
    expect(structuralUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      protectedUpdate.mock.invocationCallOrder[0],
    );
  });
});
