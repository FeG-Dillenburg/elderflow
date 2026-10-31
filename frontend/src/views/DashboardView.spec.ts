import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import { protectedText } from "../e2ee/protected-text";
import { currentMentions } from "../mentions/current";
import { setLanguage } from "../i18n";
import DashboardView from "./DashboardView.vue";
vi.mock("../mentions/current", () => ({ currentMentions: vi.fn() }));
const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  Button: { props: ["label", "disabled", "severity"], template: '<button :disabled="disabled" :data-severity="severity">{{ label }}</button>' },
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
      currentMeeting: {
        id: "current",
        title: "Current council",
        date: "2026-07-15",
        beginTime: "19:30",
        status: "in_progress",
        meetingLeader: null,
      },
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
    expect(wrapper.html()).toContain("/meetings/current");
    expect(wrapper.html()).toContain("/meetings/meeting/prepare");
    expect(wrapper.html()).toContain("/topics/topic");
    wrapper.unmount();
  });
  it("renders empty/error states", async () => {
    vi.spyOn(api, "dashboard").mockResolvedValue({
      currentMeeting: null,
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
    empty.unmount();
    failed.unmount();
  });
});

const emptyData = {
  currentMeeting: null, nextMeeting: null, myOpenTasks: [], overdueTasks: [],
  followUpTopics: [], recentTopics: [],
};
const user = {
  id: "daniel", firstName: "Daniel", role: "user",
  permissions: { topics: "view", meetings: "view", dashboard: "view" },
} as any;
const mounted: ReturnType<typeof mount>[] = [];
function dashboard() {
  const wrapper = mount(DashboardView, { shallow: true, global: { stubs } });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  auth.completeInitialization(null);
  protectedText.state.status = "locked";
  vi.useRealTimers();
});
describe("personal dashboard", () => {
  beforeEach(() => {
    vi.spyOn(api, "dashboard").mockResolvedValue(emptyData);
    auth.completeInitialization(user);
    protectedText.state.status = "locked";
    vi.mocked(currentMentions).mockReset();
  });
  it.each([
    [0, 0, "Good night"], [4, 59, "Good night"], [5, 0, "Good morning"],
    [10, 59, "Good morning"], [11, 0, "Good day"], [13, 59, "Good day"],
    [14, 0, "Good afternoon"], [17, 59, "Good afternoon"],
    [18, 0, "Good evening"], [21, 59, "Good evening"], [22, 0, "Good night"],
  ])("greets by browser local time at %s:%s", async (hour, minute, greeting) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 31, hour, minute));
    const wrapper = dashboard();
    expect(wrapper.get("h1").text()).toBe(`${greeting} Daniel!`);
    expect(wrapper.get("h1").attributes("data-tour-id")).toBe("dashboard-heading");
  });
  it("updates time, language and name safely, with a greeting-only fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 31, 10, 59, 59));
    const wrapper = dashboard();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.get("h1").text()).toBe("Good day Daniel!");
    setLanguage("de");
    auth.state.user!.firstName = "<b>Ada</b>";
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Guten Tag <b>Ada</b>!");
    expect(wrapper.find("h1 b").exists()).toBe(false);
    auth.state.user!.firstName = "  ";
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Guten Tag!");
    vi.setSystemTime(new Date(2026, 10, 1, 0, 0));
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Gute Nacht!");
  });
  it.each([0, 1, 8, 9])("shows a bounded list of %s mentions and detects More", async (count) => {
    vi.mocked(currentMentions).mockResolvedValue(Array.from({ length: count }, (_, index) => ({
      id: `${index}`, topicName: `Topic ${index}`, context: `Sentence ${index}`,
      meetingTitle: "Council", date: "2026-10-12", topicId: "topic", meetingId: "meeting", appearanceId: "appearance",
    })));
    protectedText.state.status = "unlocked";
    const wrapper = dashboard();
    await flushPromises();
    const card = wrapper.get(".newest-mentions");
    expect(card.findAll(".mention-link")).toHaveLength(Math.min(count, 8));
    for (const link of card.findAll(".mention-link")) {
      expect(link.attributes("href")).toBe("/my-mentions");
      expect(link.attributes("aria-label")).toContain("Topic");
    }
    expect(card.find(".mentions-more").exists()).toBe(count > 8);
    expect(currentMentions).toHaveBeenCalledWith(expect.any(AbortSignal), 9);
    if (!count) expect(card.text()).toContain("no current mentions");
  });
  it("keeps current Meeting, next Meeting, mentions and other cards in DOM order", async () => {
    vi.spyOn(api, "dashboard").mockResolvedValue({ ...emptyData, currentMeeting: { id: "current", date: "2026-10-12", beginTime: "19:00", title: "Current" } } as any);
    const wrapper = dashboard();
    await flushPromises();
    const cards = wrapper.findAll(".dashboard-grid > section");
    expect(cards[0].classes()).toContain("current-meeting");
    expect(cards[1].classes()).toContain("next-meeting");
    expect(cards[2].classes()).toContain("newest-mentions");
    expect(cards[2].text()).toContain("Unlock Protected text");
    expect(currentMentions).not.toHaveBeenCalled();
  });
  it("shows independent loading/error states, retries, and clears stale confidential results", async () => {
    let finish!: (rows: any[]) => void;
    vi.mocked(currentMentions).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    protectedText.state.status = "unlocked";
    const wrapper = dashboard();
    await flushPromises();
    expect(wrapper.get(".newest-mentions").text()).toContain("Loading mentions");
    const signal = vi.mocked(currentMentions).mock.calls[0][0]!;
    protectedText.state.status = "locked";
    expect(signal.aborted).toBe(true);
    finish([{ id: "stale", topicName: "Secret stale Topic" }]);
    await flushPromises();
    expect(wrapper.text()).not.toContain("Secret");
    vi.mocked(currentMentions).mockRejectedValueOnce(new Error("offline"));
    protectedText.state.status = "unlocked";
    await flushPromises();
    expect(wrapper.find(".newest-mentions [role=alert]").exists()).toBe(true);
    expect(wrapper.text()).toContain("My open tasks");
    vi.mocked(currentMentions).mockResolvedValueOnce([{
      id: "fresh", topicName: "Secret fresh Topic", context: "Secret sentence", meetingTitle: "Council", date: "2026-10-12",
    }] as any);
    await wrapper.get(".newest-mentions button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Secret fresh Topic");
    auth.completeInitialization(null);
    await flushPromises();
    expect(wrapper.text()).not.toContain("Secret");
    expect(wrapper.find(".newest-mentions").exists()).toBe(false);
  });
  it("cancels identity changes and pending requests on unmount", async () => {
    vi.mocked(currentMentions).mockReturnValue(new Promise(() => {}));
    protectedText.state.status = "unlocked";
    const wrapper = dashboard();
    await flushPromises();
    const firstSignal = vi.mocked(currentMentions).mock.calls[0][0]!;
    auth.completeInitialization({ ...user, id: "another" });
    expect(firstSignal.aborted).toBe(true);
    const secondSignal = vi.mocked(currentMentions).mock.calls.at(-1)![0]!;
    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    expect(secondSignal.aborted).toBe(true);
  });
  it.each(["it-admin", "hidden"])("hides confidential actions for %s", async (kind) => {
    auth.completeInitialization({ ...user, role: kind === "it-admin" ? "it-admin" : "user",
      permissions: { ...user.permissions, topics: "hide" } });
    const wrapper = dashboard();
    await flushPromises();
    expect(wrapper.find(".newest-mentions").exists()).toBe(false);
    expect(currentMentions).not.toHaveBeenCalled();
  });
  it("localizes More and keeps history guarded while Protected text is locked", async () => {
    const { deploymentUpdates } = await import("../deployment-updates/deployment-updates");
    const { tours } = await import("../tours/tours");
    const history = vi.spyOn(deploymentUpdates, "history").mockResolvedValue();
    const wrapper = dashboard();
    await flushPromises();
    await wrapper.get(".updates-action").trigger("click");
    expect(history).toHaveBeenCalledOnce();
    for (const guard of ["blocking", "tour", "unlock"]) {
      deploymentUpdates.state.blocking = guard === "blocking";
      tours.state.activeId = guard === "tour" ? "first-login" : null;
      protectedText.state.promptVisible = guard === "unlock";
      await flushPromises();
      expect(wrapper.get(".updates-action").attributes("disabled")).toBeDefined();
    }
    deploymentUpdates.state.blocking = false;
    tours.state.activeId = null;
    protectedText.state.promptVisible = false;
    setLanguage("de");
    vi.mocked(currentMentions).mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({
      id: `${index}`, topicName: "Thema", meetingTitle: "Sitzung", context: "Text", date: "2026-10-12",
    })) as any);
    protectedText.state.status = "unlocked";
    await flushPromises();
    expect(wrapper.get(".mentions-more").text()).toBe("Mehr");
    expect(wrapper.get(".mentions-more a").attributes("href")).toBe("/my-mentions");
    expect(wrapper.get(".mentions-more button").attributes("data-severity")).toBe("secondary");
  });

});
