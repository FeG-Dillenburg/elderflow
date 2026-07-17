import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import TopicDetailView from "./TopicDetailView.vue";
vi.mock("vue-router", () => ({
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "topic-1" } }),
}));
const stubs = {
  Button: true,
  DatePicker: true,
  Dialog: true,
  InputText: true,
  Message: true,
  Select: true,
  Tag: true,
  RichTextEditor: true,
  TopicEditDialog: true,
};
const topic: any = {
  id: "topic-1",
  name: "Topic",
  description: "<img src=x onerror=alert(1)><p>Safe</p>",
  type: "general",
  status: "open",
  followUpDate: null,
  responsibleUserId: null,
  isRecurring: false,
  defaultSectionId: null,
  defaultPosition: null,
};
describe("TopicDetailView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "topic").mockResolvedValue(structuredClone(topic));
    vi.spyOn(api, "topicUpdates").mockResolvedValue([]);
    vi.spyOn(api, "tasks").mockResolvedValue([]);
    vi.spyOn(api, "topicAppearances").mockResolvedValue([]);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
    vi.spyOn(api, "sections").mockResolvedValue([]);
  });
  const view = async () => {
    const wrapper = mount(TopicDetailView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    return wrapper;
  };
  it("loads all six resources and sanitizes topic markup", async () => {
    const wrapper = await view();
    expect(api.topicUpdates).toHaveBeenCalledWith("topic-1");
    expect(api.tasks).toHaveBeenCalledWith({
      topicId: "topic-1",
      status: "open",
    });
    expect(api.topicAppearances).toHaveBeenCalledWith("topic-1");
    expect(wrapper.html()).not.toContain("onerror=");
  });
  it("renders populated updates, task dates, and meeting appearances", async () => {
    vi.spyOn(api, "topic").mockResolvedValue({
      ...topic,
      responsibleUser: { firstName: "Ada", lastName: "Lovelace" },
      followUpDate: "2026-07-20",
      defaultSection: { name: "Main" },
      isRecurring: true,
    });
    vi.spyOn(api, "topicUpdates").mockResolvedValue([
      {
        id: "update",
        type: "minute",
        text: "<p>Minute</p>",
        date: "2026-07-15T10:00:00Z",
        createdBy: { firstName: "Ada", lastName: "Lovelace" },
        meeting: { id: "meeting", title: "Council", date: "2026-07-15" },
      },
    ] as any);
    vi.spyOn(api, "tasks").mockResolvedValue([
      {
        id: "task",
        title: "Call",
        dueDate: "2026-07-20",
        assignedTo: { firstName: "Ada", lastName: "Lovelace" },
      },
    ] as any);
    vi.spyOn(api, "topicAppearances").mockResolvedValue([
      {
        id: "appearance",
        meetingId: "meeting",
        meeting: { id: "meeting", title: "Council", date: "2026-07-15" },
        section: { name: "Main" },
      },
    ] as any);
    const wrapper = await view();
    expect(wrapper.text()).toContain("Minute");
    expect(wrapper.text()).toContain("2026-07-20");
    expect(wrapper.text()).toContain("Main");
  });
  it("handles updates and nullable/date task creation", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addTopicUpdate").mockResolvedValue({} as any);
    await vm.addUpdate();
    expect(api.addTopicUpdate).not.toHaveBeenCalled();
    vm.updateText = "<p>Update</p>";
    await vm.addUpdate();
    expect(api.addTopicUpdate).toHaveBeenCalledWith("topic-1", {
      text: "<p>Update</p>",
      type: "update",
    });
    vi.spyOn(api, "createTask").mockResolvedValue({} as any);
    vm.task.title = "Call";
    vm.task.dueDate = new Date(2026, 6, 20);
    await vm.addTask();
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: "topic-1",
        description: null,
        dueDate: "2026-07-20",
        status: "open",
      }),
    );
    vm.task.title = "Describe";
    vm.task.description = "<p>Details</p>";
    await vm.addTask();
    expect(api.createTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: "<p>Details</p>", dueDate: null }),
    );
    expect(vm.task.title).toBe("");
  });
  it("reports failed loading", async () => {
    vi.spyOn(api, "topic").mockRejectedValueOnce(new Error("Unavailable"));
    const wrapper = await view();
    expect((wrapper.vm as any).error).toBe("Unavailable");
  });
  it("uses the topic load fallback for non-Error failures", async () => {
    vi.spyOn(api, "topic").mockRejectedValueOnce("bad");
    const wrapper = await view();
    expect((wrapper.vm as any).error).toBe("Unable to load topic");
  });
});
