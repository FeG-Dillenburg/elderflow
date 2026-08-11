import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import TasksView from "./TasksView.vue";
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" } }));
const stubs = {
  Button: true,
  Column: true,
  DataTable: true,
  DatePicker: true,
  Dialog: true,
  InputText: true,
  Message: true,
  Select: true,
  Tag: true,
  RichTextEditor: true,
};
describe("TasksView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "tasks").mockResolvedValue([]);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
    vi.spyOn(api, "taskReferences").mockResolvedValue({ topics: [], meetings: [] });
  });
  const view = async () => {
    const wrapper = mount(TasksView, { shallow: true, global: { stubs } });
    await flushPromises();
    return wrapper;
  };
  it("loads expected filters and maps new task input", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(api.tasks).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open", overdue: undefined }),
    );
    vi.spyOn(api, "createTask").mockResolvedValue({} as any);
    vm.form.title = "Call";
    vm.form.description = "";
    vm.form.dueDate = new Date(2026, 6, 16);
    await vm.save();
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Call",
        description: null,
        dueDate: "2026-07-16",
        status: "open",
      }),
    );
    expect(vm.form.title).toBe("");
  });
  it("completes a task through a structural-only patch and handles errors", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "updateTask").mockResolvedValue({} as any);
    const task: any = {
      id: "task",
      title: "Call",
      description: "text",
      topicId: "topic",
      meetingId: "meeting",
      assignedToId: "user",
      dueDate: "2026-07-20",
    };
    await vm.complete(task);
    expect(api.updateTask).toHaveBeenCalledWith("task", {
      status: "done",
    });
    vi.spyOn(api, "tasks").mockRejectedValueOnce(new Error("Load failed"));
    await vm.load();
    expect(vm.loading).toBe(false);
    expect(vm.error).toBe("Load failed");
    vi.spyOn(api, "createTask").mockRejectedValueOnce(
      new Error("Create failed"),
    );
    await vm.save();
    expect(vm.saving).toBe(false);
    expect(vm.error).toBe("Create failed");
  });

  it("filters decrypted Task content locally without sending search text", async () => {
    vi.mocked(api.tasks).mockResolvedValueOnce([
      { id: "one", title: "Call family", description: "Discuss care" },
      { id: "two", title: "Budget", description: "Review numbers" },
    ] as any);
    const wrapper = await view();
    const vm: any = wrapper.vm;

    vm.search = "care";
    await wrapper.vm.$nextTick();

    expect(vm.visibleTasks.map((task: any) => task.id)).toEqual(["one"]);
    expect(api.tasks).toHaveBeenCalledTimes(1);
    expect(api.tasks).not.toHaveBeenCalledWith(expect.objectContaining({ search: expect.anything() }));
  });

  it("edits encrypted Task content through the public API", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    const task = {
      id: "task",
      title: "Old title",
      description: "Old description",
      topicId: "topic",
      meetingId: "meeting",
      assignedToId: "user",
      dueDate: "2026-07-20",
      status: "open",
    };
    vm.edit(task);
    expect(vm.form).toMatchObject({ title: "Old title", meetingId: "meeting" });
    vi.spyOn(api, "updateTask").mockResolvedValue({} as any);
    vm.form.title = "New title";

    await vm.save();

    expect(api.updateTask).toHaveBeenCalledWith("task", expect.objectContaining({
      title: "New title",
      description: "Old description",
      meetingId: "meeting",
    }));
  });
});
