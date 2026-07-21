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

  it("keeps TOP numbering and the appearance note without rendering earlier updates", () => {
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
        saveNote: vi.fn(),
      },
      global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    });

    expect(wrapper.text()).toContain("TOP 2.1");
    expect(wrapper.text()).toContain("Quarterly review");
    expect(wrapper.findComponent({ name: "PersonTopicNote" }).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Recent updates");
  });
});
