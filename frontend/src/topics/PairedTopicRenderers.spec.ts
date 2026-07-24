import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import GenericTopicAgenda from "./types/generic/GenericTopicAgenda.vue";
import GenericTopicPreparation from "./types/generic/GenericTopicPreparation.vue";
import NewMembershipTopicAppearance from "./types/new-membership/NewMembershipTopicAppearance.vue";
import RecurringTopicAgenda from "./types/recurring/RecurringTopicAgenda.vue";

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
});
