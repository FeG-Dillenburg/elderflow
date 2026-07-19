import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type AuthUser } from "../api/domain";
import { auth } from "../auth/auth";
import MeetingAgendaView from "./MeetingAgendaView.vue";

vi.mock("vue-router", () => ({
  RouterLink: { template: "<a><slot /></a>" },
  useRoute: () => ({ params: { id: "meeting-1" } }),
}));

const stubs = {
  Button: {
    props: ["label", "disabled", "loading"],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>',
  },
  Dialog: {
    props: ["visible", "header"],
    template:
      '<div v-if="visible" role="dialog" :aria-label="header"><slot /><slot name="footer" /></div>',
  },
  Select: { template: "<select><slot /></select>" },
  DatePicker: { template: "<input />" },
  Tag: { template: "<span><slot />{{ value }}</span>", props: ["value"] },
  Message: { template: "<div><slot /></div>" },
  RichTextEditor: { template: "<textarea />" },
};
const meeting: any = {
  id: "meeting-1",
  title: "Council",
  date: "2026-07-15",
  beginTime: "19:30",
  status: "planned",
  meetingLeaderId: null,
  minuteTakerId: null,
  generalNotes: "<img src=x onerror=alert(1)><p>Notes</p>",
  openingInput: "<p>&nbsp;</p>",
  participants: [],
  agenda: [
    {
      id: "item-1",
      meetingId: "meeting-1",
      topicId: "topic-1",
      sectionId: "section-1",
      position: 1,
      agendaNote: "<script>alert(1)</script><p>Agenda</p>",
      plannedDuration: 10,
      status: "planned",
      topic: {
        id: "topic-1",
        name: "Topic",
        description: "",
        type: "generic",
        status: "open",
        followUpDate: null,
        responsibleUserId: null,
        isRecurring: false,
        defaultSectionId: null,
        defaultPosition: null,
        updates: [],
      },
    },
  ],
};

describe("MeetingAgendaView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.completeInitialization(null);
    vi.spyOn(api, "meeting").mockResolvedValue(structuredClone(meeting));
    vi.spyOn(api, "sections").mockResolvedValue([
      { id: "section-1", name: "Main", position: 1, isDefault: true },
    ]);
    vi.spyOn(api, "userDirectory").mockResolvedValue([]);
  });

  const authenticatedUser = (id: string): AuthUser => ({
    id,
    email: `${id}@example.com`,
    firstName: "Current",
    lastName: "User",
    role: "user" as const,
    language: null,
    permissions: {
      dashboard: "view" as const,
      users: "view" as const,
      references: "view" as const,
      meetings: "manage" as const,
      topics: "manage" as const,
      tasks: "manage" as const,
      contentSettings: "view" as const,
      authSettings: "hide" as const,
    },
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const view = async () => {
    const wrapper = mount(MeetingAgendaView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    return wrapper;
  };
  it("loads meeting data, shows errors, and sanitizes rich text", async () => {
    const wrapper = await view();
    expect(api.meeting).toHaveBeenCalledWith("meeting-1");
    expect(wrapper.text()).toContain("Council");
    expect(wrapper.find(".section-duration").text()).toBe("10 min.");
    expect(wrapper.html()).not.toContain("onerror=");
    expect(wrapper.html()).not.toContain("<script");
    vi.spyOn(api, "meeting").mockRejectedValueOnce(new Error("Unavailable"));
    const errorView = mount(MeetingAgendaView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    expect(errorView.text()).toContain("Unavailable");
  });
  it("treats script-only rich text as empty after sanitization", async () => {
    const unsafeMeeting = structuredClone(meeting);
    unsafeMeeting.generalNotes = "<script>alert(1)</script>";
    vi.spyOn(api, "meeting").mockResolvedValueOnce(unsafeMeeting);

    const wrapper = await view();

    expect(wrapper.find(".meeting-notes").exists()).toBe(false);
    expect(wrapper.html()).not.toContain("<script");
  });
  it("limits recent updates to the prior 14 days and orders the selected three oldest-to-newest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    const wrapper = await view();
    const item = (wrapper.vm as any).meeting.agenda[0];
    item.topic.updates = [
      { id: "old", date: "2026-06-30T11:00:00Z" },
      { id: "a", date: "2026-07-13T12:00:00Z" },
      { id: "b", date: "2026-07-14T12:00:00Z" },
      { id: "c", date: "2026-07-15T11:00:00Z" },
      { id: "d", date: "2026-07-15T12:00:00Z" },
    ];
    expect(
      (wrapper.vm as any).recent(item).map((update: any) => update.id),
    ).toEqual(["b", "c", "d"]);
  });
  it("adds a minute, manages participants, and makes blank input a no-op", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "addTopicUpdate").mockResolvedValue({} as any);
    vi.spyOn(api, "addParticipant").mockResolvedValue({} as any);
    vi.spyOn(api, "removeParticipant").mockResolvedValue(undefined);
    vm.openUpdateEditor("item-1");
    expect(vm.openEditors["item-1"]).toBe(true);
    vm.updateEditors["item-1"] = "";
    await vm.addUpdate(vm.meeting.agenda[0]);
    expect(api.addTopicUpdate).not.toHaveBeenCalled();
    vm.updateEditors["item-1"] = "<p>Minute</p>";
    vm.openEditors["item-1"] = true;
    await vm.addUpdate(vm.meeting.agenda[0]);
    expect(api.addTopicUpdate).toHaveBeenCalledWith("topic-1", {
      text: "<p>Minute</p>",
      type: "minute",
      meetingId: "meeting-1",
    });
    expect(vm.updateEditors["item-1"]).toBe("");
    expect(vm.openEditors["item-1"]).toBe(false);
    await vm.addParticipant();
    expect(api.addParticipant).not.toHaveBeenCalled();
    vm.participant.userId = "user-1";
    await vm.addParticipant();
    expect(api.addParticipant).toHaveBeenCalledWith("meeting-1", {
      userId: "user-1",
      attendanceStatus: "present",
    });
    await vm.removeParticipant("user-1");
    expect(api.removeParticipant).toHaveBeenCalledWith("meeting-1", "user-1");
  });
  it("defers, completes, moves, and saves a meeting with local date/time mapping", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    vi.spyOn(api, "updateTopic").mockResolvedValue({} as any);
    vi.spyOn(api, "updateMeetingTopic").mockResolvedValue({} as any);
    vi.spyOn(api, "updateMeeting").mockResolvedValue({} as any);
    const item = vm.meeting.agenda[0];
    await vm.toggleDeferred(item);
    expect(api.updateTopic).toHaveBeenCalledWith(
      "topic-1",
      expect.objectContaining({ status: "deferred" }),
    );
    item.topic.status = "deferred";
    await vm.toggleDeferred(item);
    expect(api.updateTopic).toHaveBeenLastCalledWith(
      "topic-1",
      expect.objectContaining({ status: "open" }),
    );
    await vm.setTopicStatus(item, "done");
    expect(api.updateMeetingTopic).toHaveBeenCalled();
    const other = { ...item, id: "item-2", position: 2 };
    await vm.move([item, other], 0, 1);
    expect(api.updateMeetingTopic).toHaveBeenCalledWith(
      "meeting-1",
      expect.objectContaining({ position: 2 }),
    );
    const before = (api.updateMeetingTopic as any).mock.calls.length;
    await vm.move([item], 0, 1);
    expect((api.updateMeetingTopic as any).mock.calls).toHaveLength(before);
    vm.openEdit();
    expect(vm.editVisible).toBe(true);
    vm.editForm.title = "  ";
    vm.editForm.date = new Date(2026, 6, 16);
    vm.editForm.beginTime = new Date(2026, 6, 16, 8, 5);
    await vm.saveMeeting();
    expect(api.updateMeeting).toHaveBeenCalledWith(
      "meeting-1",
      expect.objectContaining({
        title: null,
        date: "2026-07-16",
        beginTime: "08:05",
      }),
    );
    vm.editForm.date = null;
    await vm.saveMeeting();
    expect((api.updateMeeting as any).mock.calls).toHaveLength(1);
  });

  it.each([
    ["Meeting leader", "leader"],
    ["Minute taker", "minute-taker"],
  ])("shows the Finish meeting action to the assigned %s", async (_role, userId) => {
    const activeMeeting = structuredClone(meeting);
    activeMeeting.status = "in_progress";
    activeMeeting.meetingLeaderId = "leader";
    activeMeeting.minuteTakerId = "minute-taker";
    auth.setUser(authenticatedUser(userId));
    vi.spyOn(api, "meeting").mockResolvedValueOnce(activeMeeting);

    const wrapper = await view();

    expect(wrapper.text()).toContain("Finish meeting");
  });

  it("keeps completion unavailable to unrelated users and cancellation leaves the Meeting unchanged", async () => {
    const activeMeeting = structuredClone(meeting);
    activeMeeting.status = "in_progress";
    activeMeeting.meetingLeaderId = "leader";
    auth.setUser(authenticatedUser("unrelated"));
    vi.spyOn(api, "meeting").mockResolvedValueOnce(activeMeeting);
    vi.spyOn(api, "completeMeeting").mockResolvedValue({} as any);

    const unauthorized = await view();
    expect(unauthorized.text()).not.toContain("Finish meeting");

    auth.setUser(authenticatedUser("leader"));
    vi.spyOn(api, "meeting").mockResolvedValueOnce(activeMeeting);
    const authorized = await view();
    const vm: any = authorized.vm;
    vm.finishVisible = true;
    await authorized.vm.$nextTick();
    expect(authorized.get('[role="dialog"]').attributes("aria-label")).toBe("Finish meeting?");
    expect(authorized.text()).toContain("cannot currently be undone");
    vm.finishVisible = false;
    await authorized.vm.$nextTick();
    expect(api.completeMeeting).not.toHaveBeenCalled();
  });

  it("does not show Finish meeting to an assigned view-only user", async () => {
    const activeMeeting = structuredClone(meeting);
    activeMeeting.status = "in_progress";
    activeMeeting.meetingLeaderId = "leader";
    const viewer = authenticatedUser("leader");
    viewer.permissions.meetings = "view";
    auth.setUser(viewer);
    vi.spyOn(api, "meeting").mockResolvedValueOnce(activeMeeting);

    const wrapper = await view();

    expect(wrapper.text()).not.toContain("Finish meeting");
  });

  it("prevents duplicate completion, reports failure, and switches successful completion to read-only", async () => {
    const activeMeeting = structuredClone(meeting);
    activeMeeting.status = "in_progress";
    activeMeeting.meetingLeaderId = "leader";
    const completedMeeting = structuredClone(activeMeeting);
    completedMeeting.status = "completed";
    auth.setUser(authenticatedUser("leader"));
    vi.spyOn(api, "meeting")
      .mockResolvedValueOnce(activeMeeting)
      .mockResolvedValueOnce(completedMeeting);
    const complete = vi.spyOn(api, "completeMeeting");
    let rejectCompletion!: (reason: Error) => void;
    complete.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectCompletion = reject;
    }));

    const wrapper = await view();
    const vm: any = wrapper.vm;
    vm.finishVisible = true;
    const first = vm.finishMeeting();
    const duplicate = vm.finishMeeting();
    rejectCompletion(new Error("Completion failed"));
    await Promise.all([first, duplicate]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Completion failed");

    complete.mockResolvedValueOnce(completedMeeting);
    await vm.finishMeeting();
    await flushPromises();
    expect(vm.meeting.status).toBe("completed");
    expect(wrapper.find(".header-actions").exists()).toBe(false);
    expect(wrapper.find(".topic-actions").exists()).toBe(false);
    expect(wrapper.find(".topic-footer").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Finish meeting");
  });
});
