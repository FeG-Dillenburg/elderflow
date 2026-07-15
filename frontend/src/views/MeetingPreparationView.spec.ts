import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import MeetingPreparationView from "./MeetingPreparationView.vue";

vi.mock("vue-router", () => ({
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "meeting-1" } }),
}));
const stubs = {
  Button: true,
  Dialog: true,
  InputText: true,
  Message: true,
  Select: true,
  Tag: true,
  RichTextEditor: true,
};
const meeting: any = {
  id: "meeting-1",
  title: "Council",
  agenda: [
    {
      id: "item-2",
      topicId: "topic-2",
      sectionId: "second",
      position: 2,
      topic: { name: "Later" },
    },
    {
      id: "item-1",
      topicId: "topic-1",
      sectionId: "second",
      position: 1,
      topic: { name: "First" },
    },
  ],
};

describe("MeetingPreparationView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "meeting").mockResolvedValue(structuredClone(meeting));
    vi.spyOn(api, "sections").mockResolvedValue([
      { id: "first", name: "First", position: 1, isDefault: true },
      { id: "second", name: "Second", position: 2, isDefault: false },
    ]);
    vi.spyOn(api, "meetingSuggestions").mockResolvedValue([
      {
        id: "topic-3",
        name: "Suggested",
        type: "general",
        defaultSectionId: "second",
      },
    ] as any);
  });
  const view = async () => {
    const wrapper = mount(MeetingPreparationView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    return wrapper;
  };
  it("loads, groups ordered agenda items, and records loading errors", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.grouped[1].items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-2",
    ]);
    expect(api.meetingSuggestions).toHaveBeenCalledWith("meeting-1");
    vi.spyOn(api, "meeting").mockRejectedValueOnce(new Error("No meeting"));
    const failed = mount(MeetingPreparationView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    expect((failed.vm as any).error).toBe("No meeting");
  });
  it("selects explicit, topic-default, then first available section and does nothing without one", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    const topic = { id: "topic-3", defaultSectionId: "second" };
    await vm.add(topic);
    expect(api.addMeetingTopic).toHaveBeenLastCalledWith("meeting-1", {
      topicId: "topic-3",
      sectionId: "second",
    });
    vm.selectedSections["topic-3"] = "first";
    await vm.add(topic);
    expect(api.addMeetingTopic).toHaveBeenLastCalledWith("meeting-1", {
      topicId: "topic-3",
      sectionId: "first",
    });
    vm.selectedSections = {};
    await vm.add({ id: "topic-4", defaultSectionId: null });
    expect(api.addMeetingTopic).toHaveBeenLastCalledWith("meeting-1", {
      topicId: "topic-4",
      sectionId: "first",
    });
    vm.sections = [];
    const calls = (api.addMeetingTopic as any).mock.calls.length;
    await vm.add({ id: "none", defaultSectionId: null });
    expect((api.addMeetingTopic as any).mock.calls).toHaveLength(calls);
  });
  it("removes, saves, moves, and creates an agenda topic safely", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "removeMeetingTopic").mockResolvedValue(undefined);
    vi.spyOn(api, "updateMeetingTopic").mockResolvedValue({} as any);
    vi.spyOn(api, "createTopic").mockResolvedValue({ id: "new-topic" } as any);
    vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    const item = vm.meeting.agenda[0];
    await vm.remove(item);
    expect(api.removeMeetingTopic).toHaveBeenCalledWith("meeting-1", item.id);
    await vm.saveItem(item);
    expect(api.updateMeetingTopic).toHaveBeenCalledWith("meeting-1", item);
    const other = vm.meeting.agenda[1];
    await vm.move([item, other], 0, 1);
    expect(api.updateMeetingTopic).toHaveBeenCalledTimes(3);
    const before = (api.updateMeetingTopic as any).mock.calls.length;
    await vm.move([item], 0, 1);
    expect((api.updateMeetingTopic as any).mock.calls).toHaveLength(before);
    vm.form.name = "New topic";
    vm.form.defaultSectionId = null;
    await vm.createAndAdd();
    expect(api.createTopic).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New topic" }),
    );
    expect(api.addMeetingTopic).toHaveBeenLastCalledWith("meeting-1", {
      topicId: "new-topic",
      sectionId: "first",
    });
    vm.sections = [];
    await vm.createAndAdd();
    expect(vm.newVisible).toBe(false);
  });
});
