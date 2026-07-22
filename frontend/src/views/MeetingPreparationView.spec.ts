import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import MeetingPreparationView from "./MeetingPreparationView.vue";
import { saveMeetingTopicNote } from "../topics/meetingTopicEdits";

vi.mock("vue-router", () => ({
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "meeting-1" } }),
}));
const stubs = {
  Button: true,
  Dialog: true,
  InputNumber: true,
  InputText: true,
  Message: true,
  Select: true,
  Tag: true,
  RichTextEditor: true,
  Draggable: {
    props: ["list", "group", "itemKey", "handle", "sort"],
    template: '<div class="draggable"><slot v-for="(element, index) in list" name="item" :element="element" :index="index" /><slot name="footer" /></div>',
  },
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
      plannedDuration: 10,
      topic: { name: "Later", type: "generic" },
    },
    {
      id: "item-1",
      topicId: "topic-1",
      sectionId: "second",
      position: 1,
      plannedDuration: 15,
      topic: { name: "First", type: "generic" },
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
        type: "generic",
        defaultSectionId: "second",
      },
    ] as any);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
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
  it("configures writable agenda and clone-only suggestion drag lists with handles", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(wrapper.findAll(".draggable")).toHaveLength(3);
    expect(vm.agendaGroup).toMatchObject({ name: "agenda-topics", pull: true, put: true });
    expect(vm.suggestionGroup).toMatchObject({ name: "agenda-topics", pull: "clone", put: false });
    expect(wrapper.findAll('button[aria-label="Drag topic"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("No topics yet.");
    expect(wrapper.find('[aria-label="Agenda section"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Move up"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Move down"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-label="Remove"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("25 min.");
    const durations = wrapper.findAll("input-number-stub");
    expect(durations).toHaveLength(2);
    expect(durations[0].attributes("size")).toBe("small");
    expect(durations[0].attributes("invalid")).toBe("false");
    expect(durations[0].attributes("min")).toBe("0");
    expect(durations[0].attributes("step")).toBe("5");
    expect(durations[0].attributes("suffix")).toBe(" min.");
  });
  it("omits planned duration controls and totals for Person Topics", async () => {
    const personMeeting = structuredClone(meeting);
    personMeeting.agenda[0].topic.type = "person";
    personMeeting.agenda[0].plannedDuration = 10;
    vi.spyOn(api, "meeting").mockResolvedValueOnce(personMeeting);

    const wrapper = await view();

    expect(wrapper.findAll("input-number-stub")).toHaveLength(1);
    expect(wrapper.text()).toContain("15 min.");
    expect(wrapper.text()).not.toContain("25 min.");
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
  it("adds a dragged suggestion at the target section and exact one-based position", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    const target = vm.grouped[0];
    const clone = vm.cloneSuggestion(vm.suggestions[0]);
    target.items.push(clone);
    await vm.onAgendaChange(target, { added: { element: clone, newIndex: 0 } });
    expect(api.addMeetingTopic).toHaveBeenCalledWith("meeting-1", {
      topicId: "topic-3",
      sectionId: "first",
      position: 1,
    });
    expect(target.items).toHaveLength(0);
    expect(vm.suggestions).toHaveLength(1);
  });
  it("persists an existing topic moved across sections with normalized positions", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "reorderMeetingTopics").mockResolvedValue([] as any);
    const source = vm.grouped[1];
    const target = vm.grouped[0];
    const [moved] = source.items.splice(0, 1);
    target.items.push(moved);
    await vm.onAgendaChange(target, { added: { element: moved, newIndex: 0 } });
    expect(api.reorderMeetingTopics).toHaveBeenCalledWith("meeting-1", [
      { id: "item-1", sectionId: "first", position: 1 },
      { id: "item-2", sectionId: "second", position: 1 },
    ]);
  });
  it("removes and creates an agenda topic safely", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "removeMeetingTopic").mockResolvedValue(undefined);
    vi.spyOn(api, "createTopic").mockResolvedValue({ id: "new-topic" } as any);
    vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    const item = vm.meeting.agenda[0];
    await vm.remove(item);
    expect(api.removeMeetingTopic).toHaveBeenCalledWith("meeting-1", item.id);
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
  it("labels an automatic recurrence removal as a skip and reports API conflicts", async () => {
    const recurringMeeting = structuredClone(meeting);
    recurringMeeting.agenda[0].source = "recurrence";
    recurringMeeting.agenda[0].topic.type = "recurring";
    vi.spyOn(api, "meeting").mockResolvedValueOnce(recurringMeeting);
    const wrapper = await view();
    const item = (wrapper.vm as any).meeting.agenda[0];

    expect(wrapper.find('[aria-label="Skip recurrence"]').exists()).toBe(true);

    vi.spyOn(api, "removeMeetingTopic").mockRejectedValueOnce(
      new Error("A preserved recurring appearance conflicts with this change"),
    );
    await (wrapper.vm as any).remove(item);

    expect(api.removeMeetingTopic).toHaveBeenCalledWith("meeting-1", item.id);
    expect((wrapper.vm as any).error).toBe(
      "A preserved recurring appearance conflicts with this change",
    );
  });
  it("saves positive durations and clears zero or missing durations", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "updateMeetingTopic").mockResolvedValue({} as any);
    const item = vm.grouped[1].items[0];
    item.plannedDuration = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("input-number-stub")[0].attributes("invalid")).toBe("true");
    await vm.saveDuration(item, 20);
    expect(api.updateMeetingTopic).toHaveBeenCalledWith("meeting-1", expect.objectContaining({
      id: "item-1",
      plannedDuration: 20,
    }));
    await vm.saveDuration(item, 0);
    expect(api.updateMeetingTopic).toHaveBeenLastCalledWith("meeting-1", expect.objectContaining({
      id: "item-1",
      plannedDuration: null,
    }));
    expect(item.plannedDuration).toBeNull();
    const saveCalls = vi.mocked(api.updateMeetingTopic).mock.calls.length;
    await vm.saveDuration(item, null);
    expect(api.updateMeetingTopic).toHaveBeenCalledTimes(saveCalls);
    expect(api.meeting).toHaveBeenCalledTimes(1);
    expect(vm.pending).toBe(false);
  });
  it("rolls back an optimistic duration when saving fails", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "updateMeetingTopic").mockRejectedValue(new Error("Duration save failed"));
    const item = vm.grouped[1].items[0];
    await vm.saveDuration(item, 20);
    expect(item.plannedDuration).toBe(15);
    expect(vm.error).toBe("Duration save failed");
  });

  it("reconciles a saved Person Meeting topic note without reloading the Meeting", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    const appearance = vm.grouped[1].items[0];
    vi.spyOn(api, "updateMeetingTopicNote").mockResolvedValue({
      ...appearance,
      agendaNote: "Saved context",
    });

    const result = await saveMeetingTopicNote("meeting-1", appearance)("Saved context");

    expect(api.updateMeetingTopicNote).toHaveBeenCalledWith(
      "meeting-1",
      appearance.id,
      "Saved context",
    );
    expect(appearance.agendaNote).toBe("Saved context");
    expect(result.agendaNote).toBe("Saved context");
    expect(api.meeting).toHaveBeenCalledTimes(1);
  });

  it("renders a completed Meeting without preparation controls", async () => {
    vi.spyOn(api, "meeting").mockResolvedValueOnce({
      ...structuredClone(meeting),
      status: "completed",
    });

    const wrapper = await view();

    expect(wrapper.findAll('button[aria-label="Drag topic"]')).toHaveLength(0);
    expect(wrapper.findAll('input-number-stub')).toHaveLength(0);
    expect(wrapper.findAll('[aria-label="Remove"]')).toHaveLength(0);
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(wrapper.find("dialog-stub").exists()).toBe(false);
  });
});
