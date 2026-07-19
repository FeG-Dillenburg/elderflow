import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import TopicsView from "./TopicsView.vue";
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" } }));
const stubs = {
  Button: true,
  Checkbox: true,
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
describe("TopicsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "topics").mockResolvedValue([]);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
    vi.spyOn(api, "sections").mockResolvedValue([]);
  });
  const view = async () => {
    const wrapper = mount(TopicsView, { shallow: true, global: { stubs } });
    await flushPromises();
    return wrapper;
  };
  it("loads initial filters and converts local due-date filters", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(api.topics).toHaveBeenCalledWith({
      status: "active",
      type: "",
      responsibleUserId: "",
      defaultSectionId: "",
      dueOn: undefined,
    });
    vm.filters.dueOn = new Date(2026, 6, 15);
    await vm.load();
    expect(api.topics).toHaveBeenLastCalledWith(
      expect.objectContaining({ dueOn: "2026-07-15" }),
    );
  });
  it("resets stale form data when opening and creates a converted TopicInput", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "createTopic").mockResolvedValue({} as any);
    vm.form.name = "Old";
    vm.open();
    expect(vm.form.name).toBe("");
    vm.form.name = "Alex and Sam";
    vm.form.type = "person";
    vm.form.responsibleUserId = "user-1";
    vm.form.followUpDate = new Date(2026, 6, 20);
    await vm.create();
    expect(api.createTopic).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alex and Sam",
        type: "person",
        responsibleUserId: "user-1",
        followUpDate: "2026-07-20",
      }),
    );
    expect(vm.visible).toBe(false);
  });
  it("restores loading/saving flags and records errors", async () => {
    vi.spyOn(api, "topics").mockRejectedValueOnce(new Error("Load failed"));
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.loading).toBe(false);
    expect(vm.error).toBe("Load failed");
    vi.spyOn(api, "createTopic").mockRejectedValueOnce(
      new Error("Save failed"),
    );
    await vm.create();
    expect(vm.saving).toBe(false);
    expect(vm.error).toBe("Save failed");
  });
});
