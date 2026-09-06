import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MeetingPreparationContext from "./MeetingPreparationContext.vue";

describe("MeetingPreparationContext", () => {
  it("renders sanitized previous Meeting content and every standalone Topic Update", () => {
    const wrapper = mount(MeetingPreparationContext, {
      props: {
        item: {
          id: "appearance",
          meetingId: "meeting",
          topicId: "topic",
          sectionId: "section",
          position: 1,
          plannedDuration: null,
          status: "planned",
          previousAppearance: {
            appearanceId: "previous",
            meetingId: "previous-meeting",
            preparationContext: {
              id: "previous",
              text: "<p>Earlier preparation</p><script>alert(1)</script>",
              version: 0,
            },
            personNote: null,
            meetingMinutes: {
              id: "previous",
              text: "<p>Earlier minutes</p>",
              version: 0,
            },
          },
          topic: {
            id: "topic",
            name: "Topic",
            description: null,
            type: "generic",
            status: "open",
            followUpDate: null,
            responsibleUserId: null,
            defaultSectionId: null,
            defaultPosition: null,
            recurrenceFirstDueDate: null,
            recurrenceInterval: null,
            recurrenceUnit: null,
            membershipProcessStatus: null,
            membershipStatusSignal: null,
            godparents: null,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
            updates: [
              {
                id: "update-1",
                topicId: "topic",
                text: "<p>First standalone update</p>",
                type: "update",
                date: "2026-08-20T18:00:00Z",
                createdBy: null,
              },
              {
                id: "update-2",
                topicId: "topic",
                text: "<p>Second standalone update</p>",
                type: "update",
                date: "2026-08-21T18:00:00Z",
                createdBy: null,
              },
            ],
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Previous Meeting");
    expect(wrapper.text()).toContain("Earlier preparation");
    expect(wrapper.text()).toContain("Earlier minutes");
    expect(wrapper.text()).toContain("First standalone update");
    expect(wrapper.text()).toContain("Second standalone update");
    expect(wrapper.html()).not.toContain("<script>");
  });
});
