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
            date: "2026-08-01",
            beginTime: "19:00",
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
    expect(wrapper.text()).toContain("8/1/26");
    expect(wrapper.text()).toContain("Earlier preparation");
    expect(wrapper.text()).toContain("Earlier minutes");
    expect(wrapper.text()).toContain("First standalone update");
    expect(wrapper.text()).toContain("Second standalone update");
    expect(wrapper.html()).not.toContain("<script>");
  });
  it.each(["deferredAt", "topicStatusDecision"] as const)("labels the displayed postponed appearance using %s after the Topic reopens", (field) => {
    const wrapper = mount(MeetingPreparationContext, { props: { item: {
      id: "current", topic: { type: "generic", status: "open" },
      previousAppearance: { appearanceId: "prior", meetingId: "prior-meeting", date: "2026-10-01",
        [field]: field === "deferredAt" ? "2026-10-01T20:00:00Z" : "deferred",
        preparationContext: { text: "<p>Prior context</p>" } },
    } as any } });
    expect(wrapper.find(".context-heading").text()).toContain("Postponed");
    expect(wrapper.find(".previous-preparation").text()).toBe("Prior context");
    expect(wrapper.find("[contenteditable]").exists()).toBe(false);
  });

  it.each([true, false])("keeps the latest postponement visible when older content is displayed: %s", (olderContent) => {
    const wrapper = mount(MeetingPreparationContext, { props: { item: {
      id: "current", topic: { type: "generic", status: "open" },
      preparationHistory: [{ appearanceId: "latest", meetingId: "latest-meeting", date: "2026-10-01", beginTime: "19:00", topicStatusDecision: "deferred" }],
      previousAppearance: olderContent ? { appearanceId: "older", meetingId: "older-meeting", date: "2026-09-01", preparationContext: { text: "<p>Older context</p>" } } : null,
    } as any } });
    expect(wrapper.find(".latest-postponement").text()).toContain("Latest Meeting: Postponed");
    expect(wrapper.find(".latest-postponement").text()).toContain("10/1/26");
    expect(wrapper.find(".context-heading").text()).not.toContain("Postponed");
  });

  it("does not infer historical postponement from today's deferred Topic status", () => {
    const wrapper = mount(MeetingPreparationContext, { props: { item: {
      id: "current", topic: { type: "generic", status: "deferred" },
      preparationHistory: [{ appearanceId: "latest", meetingId: "latest-meeting", date: "2026-10-01", beginTime: "19:00" }],
      previousAppearance: { appearanceId: "latest", meetingId: "latest-meeting", preparationContext: { text: "<p>Context</p>" } },
    } as any } });
    expect(wrapper.text()).not.toContain("Postponed");
  });

  it("never displays previous notes or standalone updates for a Person Topic", () => {
    const wrapper = mount(MeetingPreparationContext, {
      props: { item: {
        id: "person", meetingId: "meeting", topicId: "person", sectionId: "section",
        position: 1, plannedDuration: null, status: "planned",
        personNote: { id: "person", text: "Current person note", version: 0 },
        previousAppearance: { appearanceId: "prior", meetingId: "prior-meeting",
          personNote: { id: "prior", text: "Private historical person note", version: 0 } },
        topic: { id: "person", type: "person", updates: [{ id: "update", text: "Person update" }] } as never,
      } },
    });
    expect(wrapper.text()).toBe("");
  });

});
