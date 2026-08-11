import { Meeting } from "../meetings/meeting.entity";
import { MeetingTopic } from "../meetings/meeting-topic.entity";
import { Topic } from "../topics/topic.entity";
import { SkippedRecurrence } from "./skipped-recurrence.entity";
import { RecurrenceService } from "./recurrence.service";

describe("RecurrenceService", () => {
  const service = new RecurrenceService();

  it("keeps week and calendar-month recurrence arithmetic stable", () => {
    expect(service.addInterval("2026-01-10", 3, "weeks")).toBe("2026-01-31");
    expect(service.addInterval("2026-01-31", 1, "months")).toBe("2026-02-28");
    expect(service.addInterval("2024-01-31", 1, "months")).toBe("2024-02-29");
  });

  it("does not create recurrence structure without a client-authored initial fragment", async () => {
    const manager = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === Topic) return [{
          id: "topic",
          type: "recurring",
          status: "open",
          recurrenceFirstDueDate: "2026-01-01",
          recurrenceInterval: 1,
          recurrenceUnit: "months",
          defaultSectionId: "section",
          defaultPosition: 1,
        }];
        if (entity === Meeting) return [{
          id: "meeting",
          date: "2026-01-05",
          beginTime: "19:00",
          status: "planned",
        }];
        if (entity === MeetingTopic || entity === SkippedRecurrence) return [];
        return [];
      }),
      save: jest.fn(),
      remove: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
    };

    await service.validate(manager as never, (await manager.find(Topic))[0] as never);

    expect(manager.save).not.toHaveBeenCalledWith(MeetingTopic, expect.anything());
  });

  it("plans an unedited recurring appearance move for client-authored atomic copy-forward", async () => {
    const sourceMeeting = {
      id: "source-meeting",
      date: "2026-01-05",
      beginTime: "19:00",
      status: "planned",
    };
    const targetMeeting = {
      id: "target-meeting",
      date: "2026-03-05",
      beginTime: "19:00",
      status: "planned",
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: "topic",
        type: "recurring",
        status: "open",
        recurrenceFirstDueDate: "2026-03-01",
        recurrenceInterval: 1,
        recurrenceUnit: "months",
        defaultSectionId: "section",
        defaultPosition: 1,
      }),
      find: jest.fn(async (entity: unknown, options?: { where?: { meetingId?: string } }) => {
        if (entity === Meeting) return [sourceMeeting, targetMeeting];
        if (entity === MeetingTopic && typeof options?.where?.meetingId === "string") return [];
        if (entity === MeetingTopic) return [{
          id: "source-appearance",
          meetingId: sourceMeeting.id,
          topicId: "topic",
          source: "recurrence",
          contentEditedAt: null,
          meeting: sourceMeeting,
        }];
        if (entity === SkippedRecurrence) return [];
        return [];
      }),
      exists: jest.fn().mockResolvedValue(true),
    };

    await expect(service.plan(manager as never, "topic")).resolves.toEqual({
      moves: [{
        meetingId: targetMeeting.id,
        sectionId: "section",
        position: 1,
        sourceAppearance: { id: "source-appearance", meetingId: sourceMeeting.id },
      }],
      removals: [],
    });
  });
});
