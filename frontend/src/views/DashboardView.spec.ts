import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import DashboardView from "./DashboardView.vue";
vi.mock("vue-router", () => ({
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
}));
const stubs = {
  Button: true,
  Card: {
    template: '<section><slot name="title"/><slot name="content"/></section>',
  },
  Message: { template: "<div><slot /></div>" },
  Tag: true,
};
describe("DashboardView", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("renders populated dashboard links and unassigned/date fallbacks", async () => {
    vi.spyOn(api, "dashboard").mockResolvedValue({
      nextMeeting: {
        id: "meeting",
        title: "Council",
        date: "2026-07-15",
        beginTime: "19:30",
        meetingLeader: null,
      },
      myOpenTasks: [
        { id: "task", title: "Call", topicId: "topic", dueDate: null },
      ],
      overdueTasks: [
        { id: "late", title: "Late", assignedTo: null, dueDate: null },
      ],
      followUpTopics: [
        {
          id: "follow",
          name: "Follow",
          followUpDate: null,
          responsibleUser: null,
        },
      ],
      recentTopics: [{ id: "recent", name: "Recent", status: "open" }],
    } as any);
    const wrapper = mount(DashboardView, { shallow: true, global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("Unassigned");
    expect(wrapper.text()).toContain("No date");
    expect(wrapper.html()).toContain("/meetings/meeting");
    expect(wrapper.html()).toContain("/topics/topic");
  });
  it("renders empty/error states", async () => {
    vi.spyOn(api, "dashboard").mockResolvedValue({
      nextMeeting: null,
      myOpenTasks: [],
      overdueTasks: [],
      followUpTopics: [],
      recentTopics: [],
    });
    const empty = mount(DashboardView, { shallow: true, global: { stubs } });
    await flushPromises();
    expect(empty.text()).toContain("No upcoming meeting");
    vi.spyOn(api, "dashboard").mockRejectedValueOnce(new Error("Unavailable"));
    const failed = mount(DashboardView, { shallow: true, global: { stubs } });
    await flushPromises();
    expect(failed.text()).toContain("Unavailable");
  });
});
