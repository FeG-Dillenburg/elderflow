import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RecurringTopicAgenda from "./RecurringTopicAgenda.vue";
import RecurringTopicList from "./RecurringTopicList.vue";

const topic = {
  id: "topic",
  type: "recurring",
  name: "Quarterly review",
  recurrenceInterval: 3,
  recurrenceUnit: "months",
  nextDueDate: "2026-10-31",
};

describe("Recurring Topic renderers", () => {
  it("shows the localized interval and backend-derived next due date in the list", () => {
    const wrapper = mount(RecurringTopicList, {
      props: { topic: topic as any },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain("Every 3 months");
    expect(wrapper.text()).toContain("Next due: 10/31/2026");
  });

  it("keeps TOP numbering, paired texts, and deferral without rendering earlier updates", async () => {
    const toggleDeferred = vi.fn();
    const wrapper = mount(RecurringTopicAgenda, {
      shallow: true,
      props: {
        item: {
          topic,
          topicId: topic.id,
          agendaNote: "Copied template",
        } as any,
        number: "TOP 2.1",
        canEdit: true,
        toggleDeferred,
        savePreparationContext: vi.fn(),
        saveMinutes: vi.fn(),
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain("TOP 2.1");
    expect(wrapper.text()).toContain("Quarterly review");
    expect(wrapper.findComponent({ name: "PairedMeetingTexts" }).props("mode"))
      .toBe("preparation");
    expect(wrapper.text()).not.toContain("Recent updates");
    const deferButton = wrapper.getComponent({ name: "Button" });
    expect(deferButton.attributes("label")).toBe("Defer");
    expect(wrapper.text()).not.toContain("Mark done");
    await deferButton.vm.$emit("click");
    expect(toggleDeferred).toHaveBeenCalledOnce();
  });

  it("passes recurring paired autosave through and makes completed content read-only", async () => {
    const savePreparationContext = vi.fn().mockResolvedValue({ agendaNote: "Saved note" });
    const saveMinutes = vi.fn();
    const editable = mount(RecurringTopicAgenda, {
      shallow: true,
      props: {
        item: { topic, topicId: topic.id, agendaNote: "Draft" } as any,
        canEdit: true,
        meetingStatus: "in_progress",
        canWriteMinutes: true,
        savePreparationContext,
        saveMinutes,
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });
    const texts = editable.findComponent({ name: "PairedMeetingTexts" });

    expect(texts.props("mode")).toBe("active");
    expect(texts.props("canWriteMinutes")).toBe(true);

    const completed = mount(RecurringTopicAgenda, {
      shallow: true,
      props: {
        item: { topic, topicId: topic.id, agendaNote: "Final" } as any,
        canEdit: false,
        meetingStatus: "completed",
        savePreparationContext,
        saveMinutes,
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(completed.findComponent({ name: "PairedMeetingTexts" }).props("mode"))
      .toBe("completed");
  });
});
