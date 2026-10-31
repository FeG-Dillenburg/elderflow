import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import { createMeetingWorkspace, meetingRouteFactoryKey } from "../meetings/workspace";
import { createMeetingRouteOperations } from "../meetings/workspace/production-adapter";
import MeetingAgendaView from "./MeetingAgendaView.vue";
import PrimeVue from "primevue/config";
import MeetingPreparationView from "./MeetingPreparationView.vue";

enableAutoUnmount(afterEach);

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("vue-router", () => ({
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "meeting-1" } }),
  useRouter: () => ({ push: routerPush }),
}));
const stubs = {
  Teleport: false,
  MeetingNotes: false,
  Button: true,
  Dialog: true,
  InputNumber: true,
  InputText: true,
  Message: true,
  Select: true,
  Tag: true,
  RichTextEditor: true,
  TopicTypeRenderer: {
    template: '<div><textarea aria-label="Draft note" /><div contenteditable="true" tabindex="0">Draft selection</div><slot /></div>',
  },

};
const meeting: any = {
  id: "meeting-1",
  title: "Council",
  date: "2026-08-16",
  beginTime: "19:30",
  status: "planned",
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

let workspaceMeeting: any;
let workspaceLoadError: Error | null;
const workspaceLoad = vi.fn(async (_meetingId: string) => ({
  meeting: structuredClone(workspaceMeeting),
  unlocked: false,
  collaborative: false,
}));

const meetingRouteFactory = (meetingId: string) => {
  const workspace = createMeetingWorkspace(meetingId, {
    load: (id) => workspaceLoad(id),
    complete: vi.fn(async () => ({ ...structuredClone(workspaceMeeting), status: "completed" })),
    updateText: vi.fn().mockResolvedValue(undefined),
  });
  const opened = workspace.open();
  return {
    workspace,
    opened,
    operations: createMeetingRouteOperations(
      meetingId,
      () => workspace.refresh(),
      (target, value) => workspace.updateText(target, value),
    ),
  };
};

describe("MeetingPreparationView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    routerPush.mockReset();
    routerPush.mockResolvedValue(undefined);
    workspaceMeeting = structuredClone(meeting);
    workspaceLoadError = null;
    workspaceLoad.mockReset();
    workspaceLoad.mockImplementation(async () => {
      if (workspaceLoadError) throw workspaceLoadError;
      return { meeting: structuredClone(workspaceMeeting), unlocked: false, collaborative: false };
    });
    vi.spyOn(api, "sections").mockResolvedValue([
      { id: "first", name: "First", position: 1, defaultTopicType: null },
      { id: "second", name: "Second", position: 2, defaultTopicType: null },
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
  const view = async (attach = false) => {
    const wrapper = mount(MeetingPreparationView, {
      ...(attach ? { attachTo: document.body } : {}),
      shallow: true,
      global: { stubs, provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory } },
    });
    await flushPromises();
    return wrapper;
  };
  it("compacts only after a deliberate handle drag and preserves editor DOM on Escape", async () => {
    const wrapper = await view();
    const reorder = vi.spyOn(api, "reorderMeetingTopics").mockResolvedValue([]);
    const editor = wrapper.get("textarea").element;
    await wrapper.get("textarea").setValue("Unsaved draft");
    const handle = wrapper.get("main .drag-handle");
    handle.element.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 50, clientY: 80, bubbles: true }));
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 52, clientY: 81 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 70, clientY: 100 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(true);
    expect(wrapper.get("textarea").element).toBe(editor);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
    expect(wrapper.get("textarea").element).toBe(editor);
    expect((editor as HTMLTextAreaElement).value).toBe("Unsaved draft");
    expect(reorder).not.toHaveBeenCalled();
    expect((wrapper.vm as any).grouped[1].items.map((item: any) => item.id))
      .toEqual(["item-1", "item-2"]);
  });

  const pointer = (type: string, x: number, y: number, element: EventTarget = document) => {
    element.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));
  };
  const emptyDestination = (wrapper: Awaited<ReturnType<typeof view>>) => {
    vi.spyOn(wrapper.get('[data-agenda-section="first"]').element, "getBoundingClientRect")
      .mockReturnValue({ left: 0, right: 300, top: 0, bottom: 200, height: 200 } as DOMRect);
  };

  it("does not add a sidebar drag when compaction alone places a section under the pointer", async () => {
    const wrapper = await view();
    const add = vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    emptyDestination(wrapper);
    pointer("pointerdown", 20, 20, wrapper.get("aside .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(true);
    expect(wrapper.find(".drop-destination").exists()).toBe(false);
    pointer("pointerup", 50, 60);
    await flushPromises();
    expect(add).not.toHaveBeenCalled();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
  });

  it("adds a sidebar topic to an empty section only after movement establishes its insertion line", async () => {
    const wrapper = await view();
    const add = vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    emptyDestination(wrapper);
    pointer("pointerdown", 20, 20, wrapper.get("aside .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 70, 80);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".insertion-line").exists()).toBe(true);
    expect(wrapper.get(".drop-destination h2").text()).toContain("First");
    pointer("pointerup", 70, 80);
    await flushPromises();
    expect(add).toHaveBeenCalledWith("meeting-1", expect.objectContaining({
      topicId: "topic-3", sectionId: "first", position: 1,
    }));
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
  });

  it.each(["pointercancel", "blur"])("restores the unchanged agenda after an interrupted drag (%s)", async (event) => {
    const wrapper = await view();
    const reorder = vi.spyOn(api, "reorderMeetingTopics").mockResolvedValue([]);
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    (event === "blur" ? window : document).dispatchEvent(new Event(event));
    await flushPromises();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
    expect(reorder).not.toHaveBeenCalled();
  });

  it("restores full content and original order when a deliberate cross-section drag fails", async () => {
    const wrapper = await view();
    vi.spyOn(api, "reorderMeetingTopics").mockRejectedValue(new Error("Reorder failed"));
    const draft = wrapper.get("textarea").element;
    await wrapper.get("textarea").setValue("Unsent membership correction");
    emptyDestination(wrapper);
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 70, 80);
    pointer("pointerup", 70, 80);
    await flushPromises();
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
    expect((wrapper.vm as any).error).toBe("Reorder failed");
    expect(wrapper.get("textarea").element).toBe(draft);
    expect((draft as HTMLTextAreaElement).value).toBe("Unsent membership correction");
    expect(wrapper.findAll('[data-agenda-section="first"] article')).toHaveLength(0);
    expect(wrapper.findAll('[data-agenda-section="second"] article')).toHaveLength(2);
  });

  it("keeps unsaved editor contents and focus when a topic moves to another section", async () => {
    const wrapper = await view(true);
    const draft = wrapper.get("textarea").element as HTMLTextAreaElement;
    await wrapper.get("textarea").setValue("Unsent correction");
    const richText = wrapper.get('[contenteditable="true"]').element as HTMLElement;
    richText.focus();
    const range = document.createRange();
    range.setStart(richText.firstChild!, 6);
    range.setEnd(richText.firstChild!, 15);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    vi.spyOn(api, "reorderMeetingTopics").mockImplementation(async (_meeting, order) => {
      for (const position of order) {
        Object.assign(workspaceMeeting.agenda.find((item: any) => item.id === position.id), position);
      }
      return workspaceMeeting.agenda;
    });
    emptyDestination(wrapper);
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 70, 80);
    pointer("pointerup", 70, 80);
    await flushPromises();
    expect(wrapper.get('[data-agenda-section="first"] textarea').element).toBe(draft);
    expect(draft.value).toBe("Unsent correction");
    expect(document.activeElement).toBe(richText);
    expect(window.getSelection()!.toString()).toBe("selection");
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
  });

  it("scrolls at the page edge only while compact agenda targets remain below the viewport", async () => {
    const wrapper = await view(true);
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const scrollingElement = Object.getOwnPropertyDescriptor(document, "scrollingElement");
    const elementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: document.documentElement });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => wrapper.get(".agenda-drop-zone").element,
    });
    onTestFinished(() => {
      if (scrollingElement) Object.defineProperty(document, "scrollingElement", scrollingElement);
      else delete (document as any).scrollingElement;
      if (elementFromPoint) Object.defineProperty(document, "elementFromPoint", elementFromPoint);
      else delete (document as any).elementFromPoint;
      document.documentElement.scrollTop = 0;
    });
    const lastZone = vi.spyOn(wrapper.findAll(".agenda-drop-zone")[1].element, "getBoundingClientRect")
      .mockReturnValue({ left: 0, right: 300, top: 0, bottom: 500 } as DOMRect);
    pointer("pointerdown", 20, 20, wrapper.get("aside .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 70, window.innerHeight - 10);
    frame!(0);
    expect(document.documentElement.scrollTop).toBe(0);
    lastZone.mockReturnValue({ left: 0, right: 300, top: 0, bottom: 1500 } as DOMRect);
    frame!(16);
    expect(document.documentElement.scrollTop).toBe(12);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("cancels an active drag when the Meeting becomes completed", async () => {
    const wrapper = await view();
    const reorder = vi.spyOn(api, "reorderMeetingTopics").mockResolvedValue([]);
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    workspaceMeeting.status = "completed";
    await (wrapper.vm as any).workspace.refresh();
    await flushPromises();
    pointer("pointerup", 50, 60);
    expect(wrapper.find(".agenda-compacting").exists()).toBe(false);
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(reorder).not.toHaveBeenCalled();
  });

  it("restores a long agenda's scroll position and focused input when dragging is canceled", async () => {
    const wrapper = mount(MeetingPreparationView, {
      attachTo: document.body,
      shallow: true,
      global: { stubs, provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory } },
    });
    await flushPromises();
    const editor = wrapper.get("textarea").element as HTMLTextAreaElement;
    editor.focus();
    const scroller = wrapper.element as HTMLElement;
    scroller.style.overflowY = "auto";
    scroller.scrollTop = 900;
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    scroller.scrollTop = 150;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(scroller.scrollTop).toBe(900);
    expect(document.activeElement).toBe(editor);
    scroller.scrollTop = 0;
  });

  it("collects several candidates with distinct destinations before one batch submission", async () => {
    vi.mocked(api.meetingSuggestions).mockResolvedValue([
      { id: "topic-3", name: "One", type: "generic", defaultSectionId: "first" },
      { id: "topic-4", name: "Two", type: "generic", defaultSectionId: "second" },
    ] as any);
    const wrapper = await view();
    const batch = vi.spyOn(api, "addMeetingTopics").mockResolvedValue([]);
    const individual = vi.spyOn(api, "addMeetingTopic").mockResolvedValue({} as any);
    const buttons = wrapper.findAllComponents({ name: "Button" })
      .filter((button) => button.attributes("class")?.includes("select-topic-button"));
    expect(buttons).toHaveLength(2);
    for (const button of buttons) await button.trigger("click");
    expect(batch).not.toHaveBeenCalled();
    expect(individual).not.toHaveBeenCalled();
    expect(wrapper.get(".add-selected-topics").attributes("label")).toContain("(2)");
    await wrapper.get(".add-selected-topics").trigger("click");
    await flushPromises();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith("meeting-1", [
      expect.objectContaining({ topicId: "topic-3", sectionId: "first" }),
      expect.objectContaining({ topicId: "topic-4", sectionId: "second" }),
    ]);
    expect(individual).not.toHaveBeenCalled();
    expect(wrapper.find(".add-selected-topics").exists()).toBe(false);
  });

  it.each(["planned", "in_progress", "completed"])("shows both meeting notes above agenda sections in a %s Meeting", async (status) => {
    workspaceMeeting.status = status;
    workspaceMeeting.openingInput = '<p>Welcome <strong>everyone</strong></p>';
    workspaceMeeting.generalNotes = '<p>Bring your notes</p><img src="x" onerror="alert(1)">';
    const wrapper = await view();
    const notes = wrapper.get('section[aria-label="Meeting notes"]');
    expect(notes.findAll(".meeting-note-label").map((label) => label.text()))
      .toEqual(["Opening / input", "General notes"]);
    expect(notes.get("strong").text()).toBe("everyone");
    expect(notes.text()).toContain("Bring your notes");
    expect(notes.html()).not.toContain("onerror");
    const agenda = wrapper.get("main").element;
    expect(notes.element.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([null, "<p>&nbsp;</p>", "<script>alert(1)</script>"])("omits empty or unsafe-only meeting notes (%s)", async (content) => {
    workspaceMeeting.openingInput = content;
    workspaceMeeting.generalNotes = content;
    const wrapper = await view();
    expect(wrapper.find(".meeting-notes").exists()).toBe(false);
  });

  it("loads, groups ordered agenda items, and records loading errors", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.grouped[1].items.map((item: any) => item.id)).toEqual([
      "item-1",
      "item-2",
    ]);
    expect(api.meetingSuggestions).toHaveBeenCalledWith("meeting-1");
    workspaceLoadError = new Error("No meeting");
    const failed = mount(MeetingPreparationView, {
      shallow: true,
      global: { stubs, provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory } },
    });
    await flushPromises();
    expect((failed.vm as any).error).toBe("Unable to load meeting preparation");
  });
  it("clears the initial load error and restores Agenda sections and suggestions after workspace retry", async () => {
    workspaceLoadError = new TypeError("Offline");
    vi.mocked(api.sections).mockRejectedValueOnce(new TypeError("Offline"));
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.error).toBe("Unable to load meeting preparation");
    workspaceLoadError = null;
    await vm.workspace.open();
    await flushPromises();
    expect(vm.error).toBe("");
    expect(vm.grouped[1].items.map((item: any) => item.id)).toEqual(["item-1", "item-2"]);
    expect(vm.suggestions[0].name).toBe("Suggested");
  });

  it("keeps the load error if presentation data still cannot load on retry", async () => {
    workspaceLoadError = new TypeError("Offline");
    const wrapper = await view();
    const vm: any = wrapper.vm;
    workspaceLoadError = null;
    vi.mocked(api.sections).mockRejectedValueOnce(new TypeError("Still unavailable"));
    await vm.workspace.open();
    await flushPromises();
    expect(vm.error).toBe("Unable to load meeting preparation");
    expect(vm.grouped).toEqual([]);
  });

  it("keeps Topic status out of preparation and starts a planned Meeting after confirmation", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "updateMeeting").mockResolvedValue({ ...meeting, status: "in_progress" } as any);

    expect(wrapper.text()).not.toContain("Open");
    expect(wrapper.find('[label="Start meeting"]').exists()).toBe(true);

    await vm.startMeeting();

    expect(api.updateMeeting).toHaveBeenCalledWith("meeting-1", {
      status: "in_progress",
    });
    expect(routerPush).toHaveBeenCalledWith("/meetings/meeting-1");
  });
  it("opens meeting details without leaving preparation", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;

    expect(vm.detailsVisible).toBe(false);

    vm.openDetails();

    expect(vm.detailsVisible).toBe(true);
    expect(vm.detailsForm.title).toBe("Council");
    expect(vm.detailsReadOnly).toBe(false);
  });
  it("makes protected detail fields read-only after the Meeting starts", async () => {
    workspaceMeeting = {
      ...structuredClone(meeting),
      status: "in_progress",
    };
    const wrapper = await view();
    const vm: any = wrapper.vm;

    vm.openDetails();

    expect(vm.detailsReadOnly).toBe(true);
  });
  it("loads future suggestions only after the toggle and renders them below it", async () => {
    vi.mocked(api.meetingSuggestions).mockImplementation(async (_id, options) =>
      options?.future
        ? [{ id: "future", name: "Future", type: "generic" } as any]
        : [{ id: "due", name: "Due", type: "generic" } as any]);
    const wrapper = await view();
    const vm: any = wrapper.vm;

    expect(api.meetingSuggestions).toHaveBeenCalledTimes(1);
    expect(api.meetingSuggestions).toHaveBeenCalledWith("meeting-1");
    expect(vm.visibleSuggestionLists).toHaveLength(1);
    expect(wrapper.get(".future-topics-toggle").attributes("label"))
      .toBe("Show future topics");

    await vm.toggleFutureTopics();
    await flushPromises();

    expect(api.meetingSuggestions).toHaveBeenLastCalledWith(
      "meeting-1",
      { future: true },
    );
    expect(vm.visibleSuggestionLists).toHaveLength(2);
    expect(vm.visibleSuggestionLists[1][0].id).toBe("future");
    expect(wrapper.get(".future-topics-toggle").attributes("label"))
      .toBe("Hide future topics");
    expect(wrapper.html().indexOf("future-topics-toggle"))
      .toBeLessThan(wrapper.html().indexOf("future-suggestions"));

    await vm.toggleFutureTopics();

    expect(vm.showFutureTopics).toBe(false);
    expect(vm.visibleSuggestionLists).toHaveLength(1);
    expect(api.meetingSuggestions).toHaveBeenCalledTimes(2);
  });
  it("keeps the original drag handles, agenda sections, and duration controls", async () => {
    const wrapper = await view();
    expect(wrapper.findAll(".agenda-drop-zone")).toHaveLength(2);
    expect(wrapper.findAll('button[aria-label="Drag topic"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("No topics yet.");
    expect(wrapper.find('[aria-label="Agenda section"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Move up"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Move down"]').exists()).toBe(false);
    expect(wrapper.findAll('[aria-label="Remove from agenda"]')).toHaveLength(2);
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
    workspaceMeeting = personMeeting;

    const wrapper = await view();

    expect(wrapper.findAll("input-number-stub")).toHaveLength(1);
    expect(wrapper.text()).toContain("15 min.");
    expect(wrapper.text()).not.toContain("25 min.");
  });
  it("selects explicit, previous, topic-default, then first available section", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    const topic = { id: "topic-3", defaultSectionId: "second" };
    expect(vm.sectionFor(topic)).toBe("second");
    vm.selectedSections["topic-3"] = "first";
    expect(vm.sectionFor(topic)).toBe("first");
    vm.selectedSections = {};
    expect(vm.sectionFor({
      id: "topic-4",
      previousSectionId: "second",
      defaultSectionId: "first",
    })).toBe("second");
    expect(vm.sectionFor({ id: "topic-5", defaultSectionId: null })).toBe("first");
    vm.sections = [];
    expect(vm.sectionFor({ id: "none", defaultSectionId: null })).toBeUndefined();
  });
  it("defaults to the previous section, marks new Topics, and batches preselected additions", async () => {
    vi.mocked(api.meetingSuggestions).mockResolvedValueOnce([{
      id: "topic-3",
      name: "Suggested",
      type: "generic",
      defaultSectionId: "second",
      previousSectionId: "first",
      isNew: true,
    }] as any);
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addMeetingTopics").mockResolvedValue([]);

    expect(vm.selectedSections["topic-3"]).toBe("first");
    expect(wrapper.get(".new-topic-tag").attributes("value")).toBe("New");

    vm.toggleSelected(vm.suggestions[0]);
    expect(vm.isSelected(vm.suggestions[0])).toBe(true);
    await vm.addSelected();

    expect(api.addMeetingTopics).toHaveBeenCalledWith("meeting-1", [{
      topicId: "topic-3",
      sectionId: "first",
      topic: expect.objectContaining({ id: "topic-3" }),
    }]);
  });
  it("keeps the preselection available when a batched addition fails", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addMeetingTopics").mockRejectedValue(new Error("Batch failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vm.toggleSelected(vm.suggestions[0]);

    await vm.addSelected();

    expect(vm.isSelected(vm.suggestions[0])).toBe(true);
    expect(vm.error).toBe("Batch failed");
  });
  it("defaults future suggestions to their previous Meeting section", async () => {
    vi.mocked(api.meetingSuggestions).mockImplementation(async (_id, options) =>
      options?.future
        ? [{
            id: "future",
            name: "Future",
            type: "generic",
            defaultSectionId: "second",
            previousSectionId: "first",
          } as any]
        : []);
    const wrapper = await view();
    const vm: any = wrapper.vm;

    await vm.toggleFutureTopics();
    await flushPromises();

    expect(vm.selectedSections.future).toBe("first");
    expect(vm.sectionFor(vm.futureSuggestions[0])).toBe("first");
  });
  it("persists an existing topic moved across sections with normalized positions", async () => {
    const wrapper = await view();
    vi.spyOn(api, "reorderMeetingTopics").mockResolvedValue([] as any);
    emptyDestination(wrapper);
    pointer("pointerdown", 20, 20, wrapper.get("main .drag-handle").element);
    pointer("pointermove", 50, 60);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 70, 80);
    pointer("pointerup", 70, 80);
    await flushPromises();
    expect(api.reorderMeetingTopics).toHaveBeenCalledWith("meeting-1", [
      { id: "item-1", sectionId: "first", position: 1 },
      { id: "item-2", sectionId: "second", position: 1 },
    ]);
  });
  it("removes and creates an agenda topic safely", async () => {
    const previousUser = auth.state.user;
    auth.state.user = { id: "leader", role: "user" } as any;
    workspaceMeeting.meetingLeaderId = "leader";
    onTestFinished(() => { auth.state.user = previousUser; });
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
      topic: expect.objectContaining({ id: "new-topic" }),
    });
    vm.sections = [];
    await vm.createAndAdd();
    expect(vm.newVisible).toBe(false);
  });
  it("keeps rejected topic creation open with its error visible", async () => {
    const wrapper = mount(MeetingPreparationView, {
      shallow: true,
      global: {
        stubs: {
          ...stubs,
          Dialog: { template: '<div><slot /><slot name="footer" /></div>' },
          Message: { template: '<div><slot /></div>' },
        },
        provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory },
      },
    });
    await flushPromises();
    const vm: any = wrapper.vm;
    vm.newVisible = true;
    vi.spyOn(api, "createTopic").mockRejectedValueOnce(new Error("Invalid default position"));
    await wrapper.vm.$nextTick();
    await wrapper.get("#new-topic").trigger("submit");
    await flushPromises();
    expect(vm.newVisible).toBe(true);
    expect(wrapper.get(".topic-create-error").text()).toBe("Invalid default position");
  });
  it("labels an automatic recurrence removal as a skip and reports API conflicts", async () => {
    const recurringMeeting = structuredClone(meeting);
    recurringMeeting.agenda[0].source = "recurrence";
    recurringMeeting.agenda[0].topic.type = "recurring";
    workspaceMeeting = recurringMeeting;
    const wrapper = await view();
    const item = (wrapper.vm as any).meeting.agenda[0];

    expect(wrapper.find('[aria-label="Skip recurrence"]').exists()).toBe(true);

    vi.spyOn(api, "removeMeetingTopic").mockRejectedValueOnce(
      new Error("A preserved recurring appearance conflicts with this change"),
    );
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await (wrapper.vm as any).remove(item);

    expect(api.removeMeetingTopic).toHaveBeenCalledWith("meeting-1", item.id);
    expect(diagnostic).not.toHaveBeenCalled();
    expect((wrapper.vm as any).error).toBe(
      "A preserved recurring appearance conflicts with this change",
    );
  });
  it("preserves one minute and reordered topics through the active agenda and preparation round trip", async () => {
    workspaceMeeting.status = "in_progress";
    workspaceMeeting.agenda[0].position = 1;
    workspaceMeeting.agenda[1].position = 2;
    vi.spyOn(api, "updateMeetingTopic").mockImplementation(async (_meeting, id, patch) => {
      const item = workspaceMeeting.agenda.find((item: any) => item.id === id);
      Object.assign(item, patch);
      return structuredClone(item);
    });
    const preparation = () => mount(MeetingPreparationView, {
      shallow: true,
      global: {
        plugins: [PrimeVue],
        stubs: { ...stubs, InputNumber: false, InputText: false },
        provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory },
      },
    });
    let wrapper = preparation();
    await flushPromises();
    const vm: any = wrapper.vm;
    // Retain this appearance while another client updates unrelated fields.
    const stale = vm.grouped[1].items[0];
    workspaceMeeting.agenda[0].status = "done";
    await vm.saveDuration(stale, 1);
    expect(api.updateMeetingTopic).toHaveBeenCalledWith("meeting-1", "item-2", { plannedDuration: 1 });
    expect((wrapper.findAll('input[role="spinbutton"]')[0].element as HTMLInputElement).value).toBe("1 min.");
    wrapper.unmount();
    const agenda = mount(MeetingAgendaView, {
      shallow: true,
      global: { stubs, provide: { [meetingRouteFactoryKey as symbol]: meetingRouteFactory } },
    });
    await flushPromises();
    expect((agenda.vm as any).meeting.agenda[0]).toMatchObject({
      id: "item-2", position: 1, plannedDuration: 1, status: "done",
    });
    agenda.unmount();
    wrapper = preparation();
    await flushPromises();
    expect((wrapper.vm as any).grouped[1].items.map((item: any) => item.id)).toEqual(["item-2", "item-1"]);
    expect((wrapper.findAll('input[role="spinbutton"]')[0].element as HTMLInputElement).value).toBe("1 min.");
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
    expect(api.updateMeetingTopic).toHaveBeenCalledWith("meeting-1", "item-1", expect.objectContaining({
      plannedDuration: 20,
    }));
    await vm.saveDuration(item, 0);
    expect(api.updateMeetingTopic).toHaveBeenLastCalledWith("meeting-1", "item-1", expect.objectContaining({
      plannedDuration: null,
    }));
    expect(item.plannedDuration).toBeNull();
    const saveCalls = vi.mocked(api.updateMeetingTopic).mock.calls.length;
    await vm.saveDuration(item, null);
    expect(api.updateMeetingTopic).toHaveBeenCalledTimes(saveCalls);
    expect(workspaceLoad).toHaveBeenCalledTimes(3);
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

  it("renders a completed Meeting without preparation controls", async () => {
    workspaceMeeting = {
      ...structuredClone(meeting),
      status: "completed",
    };

    const wrapper = await view();

    expect(wrapper.findAll('button[aria-label="Drag topic"]')).toHaveLength(0);
    expect(wrapper.findAll('input-number-stub')).toHaveLength(0);
    expect(wrapper.findAll('[aria-label="Remove from agenda"]')).toHaveLength(0);
    expect(wrapper.find("aside").exists()).toBe(false);
    expect(wrapper.find("dialog-stub").exists()).toBe(false);
  });
});
