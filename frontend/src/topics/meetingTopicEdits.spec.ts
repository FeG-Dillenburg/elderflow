import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type MeetingTopic } from "../api/domain";
import { saveMeetingTopicField } from "./meetingTopicEdits";
import { createMeetingRouteOperations } from "../meetings/workspace/production-adapter";

const operations = () => createMeetingRouteOperations("meeting", async () => undefined);

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

describe("Meeting topic field saves", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

    await saveMeetingTopicField(operations(), appearance)({
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

    await saveMeetingTopicField(operations(), appearance)({
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

    await saveMeetingTopicField(operations(), appearance)({
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
