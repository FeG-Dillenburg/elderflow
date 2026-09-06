import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GenericTopicAgenda from "./types/generic/GenericTopicAgenda.vue";
import GenericTopicPreparation from "./types/generic/GenericTopicPreparation.vue";
import NewMembershipTopicAppearance from "./types/new-membership/NewMembershipTopicAppearance.vue";
import NewMembershipTopicPreparation from "./types/new-membership/NewMembershipTopicPreparation.vue";
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

  it("shows previous Meeting content and standalone Updates above Generic preparation", () => {
    const type = "generic";
    const topicItem = {
      ...item(type),
      previousAppearance: {
        appearanceId: "previous",
        meetingId: "previous-meeting",
        preparationContext: { id: "previous", text: "Earlier preparation", version: 0 },
        personNote: null,
        meetingMinutes: { id: "previous", text: "Earlier minutes", version: 0 },
      },
    };
    topicItem.topic.updates = [{
      id: "update",
      text: "Standalone update",
      date: "2026-08-20T18:00:00Z",
    }];
    const wrapper = shallowMount(GenericTopicPreparation, {
      props: {
        topic: topicItem.topic,
        item: topicItem,
        readOnly: false,
        ...saves,
      } as any,
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
      .toBeLessThan(wrapper.html().indexOf("paired-meeting-texts-stub"));
  });

  it("omits previous Meeting content and standalone Updates from Person preparation", () => {
    const personItem = {
      ...item("person"),
      previousAppearance: {
        appearanceId: "previous",
        meetingId: "previous-meeting",
        personNote: { id: "previous", text: "Earlier Person note", version: 0 },
      },
    };
    personItem.topic.updates = [{
      id: "update",
      text: "Standalone update",
      date: "2026-08-20T18:00:00Z",
    }];
    const wrapper = shallowMount(PersonTopicPreparation, {
      props: {
        topic: personItem.topic,
        item: personItem,
        readOnly: false,
        saveNote: vi.fn(),
      },
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" },
        },
      },
    });

    expect(wrapper.findComponent({ name: "MeetingPreparationContext" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "PersonTopicNote" }).exists()).toBe(true);
  });

  it("places New membership history inside the lower note box above its editor", () => {
    const membershipItem = {
      ...item("new_membership"),
      previousAppearance: {
        appearanceId: "previous",
        meetingId: "previous-meeting",
        preparationContext: { id: "previous", text: "Earlier preparation", version: 0 },
        meetingMinutes: { id: "previous", text: "Earlier minutes", version: 0 },
      },
    };
    const wrapper = shallowMount(NewMembershipTopicPreparation, {
      props: {
        topic: membershipItem.topic,
        item: membershipItem,
        readOnly: false,
        users: [],
        saveField: vi.fn(),
        ...saves,
      },
      global: {
        stubs: {
          NewMembershipTopicAppearance: {
            name: "NewMembershipTopicAppearance",
            template: `
              <div class="membership-appearance-stub">
                <div class="note-field">
                  <slot name="before-meeting-texts" />
                  <div class="paired-meeting-texts-stub" />
                </div>
              </div>
            `,
          },
        },
      },
    });

    const noteField = wrapper.get(".note-field");
    expect(noteField.findComponent({ name: "MeetingPreparationContext" }).exists()).toBe(true);
    expect(noteField.html().indexOf("meeting-preparation-context-stub"))
      .toBeLessThan(noteField.html().indexOf("paired-meeting-texts-stub"));
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
