import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import MeetingsView from "./MeetingsView.vue";
const push = vi.fn();
vi.mock("vue-router", () => ({
  RouterLink: { template: "<a><slot /></a>" },
  useRouter: () => ({ push }),
}));
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
};
describe("MeetingsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    vi.spyOn(api, "meetings").mockResolvedValue([]);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
    vi.spyOn(api, "sections").mockResolvedValue([]);
    vi.spyOn(api, "meetingSuggestions").mockResolvedValue([]);
    vi.spyOn(api, "addMeetingTopics").mockResolvedValue([]);
  });
  const view = async () => {
    const wrapper = mount(MeetingsView, { shallow: true, global: { stubs } });
    await flushPromises();
    return wrapper;
  };
  it("loads data, rejects missing date, and routes after valid creation", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "createMeeting").mockResolvedValue({
      id: "meeting-1",
    } as any);
    await vm.create();
    expect(api.createMeeting).not.toHaveBeenCalled();
    vm.form.title = "  ";
    vm.form.date = new Date(2026, 6, 15);
    await vm.create();
    expect(api.createMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        title: null,
        date: "2026-07-15",
        generalNotes: null,
        openingInput: null,
      }),
    );
    expect(push).toHaveBeenCalledWith("/meetings/meeting-1/prepare");
  });
  it("automatically adds every open or deferred Person and New membership Topic", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "createMeeting").mockResolvedValue({ id: "meeting-1" } as any);
    vi.mocked(api.sections).mockResolvedValue([
      { id: "fallback", name: "Fallback", position: 1, isDefault: true },
    ]);
    vi.mocked(api.meetingSuggestions)
      .mockResolvedValueOnce([
        {
          id: "person",
          type: "person",
          status: "open",
          previousSectionId: "previous",
          defaultSectionId: null,
        },
        {
          id: "generic",
          type: "generic",
          status: "open",
          previousSectionId: null,
          defaultSectionId: "fallback",
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          id: "membership",
          type: "new_membership",
          status: "deferred",
          previousSectionId: null,
          defaultSectionId: "fallback",
        },
      ] as any);
    vm.form.date = new Date(2026, 6, 15);

    await vm.create();

    expect(api.meetingSuggestions).toHaveBeenNthCalledWith(1, "meeting-1");
    expect(api.meetingSuggestions).toHaveBeenNthCalledWith(
      2,
      "meeting-1",
      { future: true },
    );
    expect(api.addMeetingTopics).toHaveBeenCalledWith("meeting-1", [
      expect.objectContaining({ topicId: "person", sectionId: "previous" }),
      expect.objectContaining({ topicId: "membership", sectionId: "fallback" }),
    ]);
  });
  it("restores flags after load/create failure", async () => {
    vi.spyOn(api, "meetings").mockRejectedValueOnce(new Error("Load failed"));
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.loading).toBe(false);
    expect(vm.error).toBe("Load failed");
    vm.form.date = new Date(2026, 6, 15);
    vi.spyOn(api, "createMeeting").mockRejectedValueOnce(
      new Error("Create failed"),
    );
    await vm.create();
    expect(vm.saving).toBe(false);
    expect(vm.error).toBe("Create failed");
  });
});
