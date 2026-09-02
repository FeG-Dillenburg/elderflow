import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GenericTopicAgenda from "./types/generic/GenericTopicAgenda.vue";
import GenericTopicPreparation from "./types/generic/GenericTopicPreparation.vue";
import NewMembershipTopicAppearance from "./types/new-membership/NewMembershipTopicAppearance.vue";
import RecurringTopicAgenda from "./types/recurring/RecurringTopicAgenda.vue";
import PersonTopicPreparation from "./types/person/PersonTopicPreparation.vue";

const item = (type: string) => ({
  id: "appearance",
  topicId: "topic",
  topic: {
    id: "topic",
    name: "Topic",
    type,
    responsibleUserId: null,
    responsibleUser: null,
    membershipProcessStatus: null,
    membershipStatusSignal: type === "new_membership" ? "new" : null,
    godparents: null,
  },
  preparationContext: { id: "appearance", text: "Context", version: 0 },
  meetingMinutes: null,
}) as any;

const saves = {
  savePreparationContext: vi.fn(),
  saveMinutes: vi.fn(),
};

describe("paired Topic renderers", () => {
  it("adds direct preparation-context editing to Generic preparation", () => {
    const wrapper = shallowMount(GenericTopicPreparation, {
      props: {
        topic: item("generic").topic,
        item: item("generic"),
        readOnly: false,
        ...saves,
      },
    });

    const texts = wrapper.getComponent({ name: "PairedMeetingTexts" });
    expect(texts.props("mode")).toBe("preparation");
  });

  it.each([
    ["generic", GenericTopicPreparation],
    ["person", PersonTopicPreparation],
  ])("shows previous Meeting content and standalone Updates above %s preparation", (type, component) => {
    const topicItem = {
      ...item(type),
      previousAppearance: {
        appearanceId: "previous",
        meetingId: "previous-meeting",
        preparationContext: { id: "previous", text: "Earlier preparation", version: 0 },
        personNote: type === "person"
          ? { id: "previous", text: "Earlier Person note", version: 0 }
          : null,
        meetingMinutes: { id: "previous", text: "Earlier minutes", version: 0 },
      },
    };
    topicItem.topic.updates = [{
      id: "update",
      text: "Standalone update",
      date: "2026-08-20T18:00:00Z",
    }];
    const wrapper = shallowMount(component as any, {
      props: (type === "person"
        ? {
            topic: topicItem.topic,
            item: topicItem,
            readOnly: false,
            saveNote: vi.fn(),
          }
        : {
            topic: topicItem.topic,
            item: topicItem,
            readOnly: false,
            ...saves,
          }) as any,
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    const context = wrapper.findComponent({ name: "MeetingPreparationContext" });
    expect(context.exists()).toBe(true);
    expect(context.props("item")).toEqual(topicItem);
    expect(wrapper.html().indexOf("meeting-preparation-context-stub"))
      .toBeLessThan(wrapper.html().indexOf(type === "person"
        ? "person-topic-note-stub"
        : "paired-meeting-texts-stub"));
  });

  it.each([
    ["generic", GenericTopicAgenda],
    ["recurring", RecurringTopicAgenda],
  ])("shows read-only %s preparation above active Minutes", (_type, component) => {
    const wrapper = shallowMount(component, {
      props: {
        item: item(_type),
        canEdit: true,
        meetingStatus: "in_progress",
        canWriteMinutes: true,
        ...saves,
      } as any,
    });

    const texts = wrapper.getComponent({ name: "PairedMeetingTexts" });
    expect(texts.props()).toMatchObject({
      mode: "active",
      canWriteMinutes: true,
    });
    if (_type === "generic") {
      expect(texts.classes()).toContain("meeting-texts");
    }
  });

  it("uses the same paired lifecycle inside the New membership layout", () => {
    const wrapper = shallowMount(NewMembershipTopicAppearance, {
      props: {
        item: item("new_membership"),
        canEdit: true,
        meetingTextMode: "active",
        canWriteMinutes: true,
        users: [],
        saveField: vi.fn(),
        ...saves,
      } as any,
    });

    const texts = wrapper.getComponent({ name: "PairedMeetingTexts" });
    expect(texts.props("mode")).toBe("active");
  });

  it("renders recent Generic updates before the paired Meeting texts", () => {
    const wrapper = shallowMount(GenericTopicAgenda, {
      props: {
        item: item("generic"),
        canEdit: true,
        meetingStatus: "in_progress",
        recentUpdates: [{
          id: "update",
          text: "Earlier update",
          date: "2026-07-19T18:43:00Z",
        }],
        ...saves,
      } as any,
    });
    const html = wrapper.html();

    expect(html.indexOf("Earlier update")).toBeLessThan(
      html.indexOf("paired-meeting-texts-stub"),
    );
  });

  it.each([
    ["generic", GenericTopicAgenda],
    ["recurring", RecurringTopicAgenda],
  ])("marks a deferred %s appearance only in the completed Meeting", (_type, component) => {
    const deferredItem = {
      ...item(_type),
      deferredAt: "2026-07-15T20:30:00.000Z",
    };
    const completed = shallowMount(component, {
      props: {
        item: deferredItem,
        meetingStatus: "completed",
        ...saves,
      } as any,
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });
    const active = shallowMount(component, {
      props: {
        item: deferredItem,
        meetingStatus: "in_progress",
        ...saves,
      } as any,
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(completed.get(".deferred-marker").text()).toBe("Deferred");
    expect(active.find(".deferred-marker").exists()).toBe(false);
  });
});
