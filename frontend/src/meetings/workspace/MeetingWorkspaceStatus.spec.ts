import PrimeVue from "primevue/config";
import { setLanguage } from "../../i18n";
import { createMeetingWorkspace } from "./core";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import MeetingWorkspaceStatus from "./MeetingWorkspaceStatus.vue";
import type { MeetingWorkspace, MeetingWorkspaceState, MeetingWorkspaceCollaboration } from "./core";
import { meetingRouteFactoryKey, useMeetingRoute } from "./vue";

const meeting = {
  id: "meeting-1",
  status: "planned",
} as Meeting;

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

describe("MeetingWorkspaceStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelector("#meeting-workspace-status")?.remove();
  });

  it.each([
    ["en", false, "All your changes were saved.", "success"],
    ["de", false, "Alle Ihre Änderungen wurden gespeichert.", "success"],
    ["en", true, "Your unsynchronized changes could not be saved and were discarded.", "warn"],
    ["de", true, "Ihre nicht synchronisierten Änderungen konnten nicht gespeichert werden und wurden verworfen.", "warn"],
  ] as const)("shows the correct %s completion notice (discarded: %s)", async (language, discarded, message, severity) => {
    setLanguage(language);
    let notify!: () => void;
    let completed = false;
    const connection: MeetingWorkspaceCollaboration = {
      phase: "ready", pending: false, discardedChanges: discarded, collaborators: [], close: vi.fn(),
      subscribe(listener) { notify = listener; return () => undefined; },
    };
    const workspace = createMeetingWorkspace(meeting.id, {
      load: async () => ({ meeting: { ...meeting, status: completed ? "completed" : "in_progress" }, unlocked: true }),
      connect: async () => connection,
      complete: vi.fn(),
    });
    await workspace.open();
    const Harness = defineComponent({
      setup() {
        useMeetingRoute(meeting.id);
        return () => h(MeetingWorkspaceStatus);
      },
    });
    const wrapper = mount(Harness, {
      global: {
        plugins: [PrimeVue],
        stubs: { Teleport: true },
        provide: {
          [meetingRouteFactoryKey as symbol]: () => ({ workspace, opened: Promise.resolve(), operations: {} }),
        },
      },
    });
    completed = true;
    Object.assign(connection, { failure: "completed" });
    notify();
    await vi.waitFor(() => expect(wrapper.find(`.p-message-${severity}`).text()).toContain(message));
    expect(wrapper.find(`.p-message-${severity === "success" ? "warn" : "success"}`).exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ["en", "Dismiss notice"],
    ["de", "Hinweis schließen"],
  ] as const)("dismisses the notice with an accessible %s close button", async (language, label) => {
    setLanguage(language);
    const workspace = createMeetingWorkspace(`notice-${language}`, {
      load: async () => ({ meeting: { ...meeting, id: `notice-${language}` }, unlocked: true, collaborative: false }),
      complete: vi.fn(),
    });
    await workspace.open();
    workspace.forceClose("logout");
    await workspace.open();
    const Harness = defineComponent({
      setup() {
        useMeetingRoute(workspace.meetingId);
        return () => h(MeetingWorkspaceStatus);
      },
    });
    const wrapper = mount(Harness, {
      global: {
        plugins: [PrimeVue],
        stubs: { Teleport: true },
        provide: {
          [meetingRouteFactoryKey as symbol]: () => ({ workspace, opened: Promise.resolve(), operations: {} }),
        },
      },
    });
    const dismiss = wrapper.find(`button[aria-label="${label}"]`);
    expect(dismiss.exists()).toBe(true);
    await dismiss.trigger("click");
    expect(workspace.state.notice).toBeUndefined();
    expect(wrapper.find(".p-message").exists()).toBe(false);
    wrapper.unmount();
  });

  it("steps the sync illustration, debounces the clock icon, then fades it", async () => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    target.id = "meeting-workspace-status";
    document.body.append(target);
    const state: Mutable<MeetingWorkspaceState> = reactive({
      phase: "ready",
      meeting,
      pendingChanges: false,
      syncActivity: 0,
      collaborators: [{
        id: "user-2",
        name: "Daria Muster",
        initials: "DM",
        color: "#123456",
      }],
    });
    const workspace: MeetingWorkspace = {
      meetingId: meeting.id,
      get state() { return state; },
      open: vi.fn(),
      refresh: vi.fn(),
      text: vi.fn(),
      updateText: vi.fn(),
      complete: vi.fn(),
      close: vi.fn(),
      cancelClose: vi.fn(),
      dismissNotice: vi.fn(),
      forceClose: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const Harness = defineComponent({
      setup() {
        useMeetingRoute(meeting.id);
        return () => h(MeetingWorkspaceStatus);
      },
    });
    const wrapper = mount(Harness, {
      global: {
        provide: {
          [meetingRouteFactoryKey as symbol]: () => ({
            workspace,
            operations: {} as never,
            opened: Promise.resolve(),
          }),
        },
      },
    });

    expect(target.textContent).toContain("Live collaboration connected");
    expect(target.querySelector(".workspace-sync-activity.is-visible")).toBeNull();
    expect(target.querySelector(".workspace-phase .pi-wifi")).not.toBeNull();

    state.phase = "syncing";
    state.pendingChanges = true;
    state.syncActivity += 1;
    await nextTick();
    await nextTick();

    const firstStep = target.querySelector<HTMLElement>(".workspace-sync-activity");
    const visiblePhase = target.querySelector(".workspace-phase > span:not(.visually-hidden)");
    expect(visiblePhase?.textContent).toContain("Live collaboration connected");
    expect(visiblePhase?.textContent).not.toContain("Synchronizing encrypted Meeting changes");
    expect(target.textContent).not.toContain("Encrypted changes pending");
    expect(firstStep).not.toBeNull();
    expect(firstStep?.classList.contains("is-visible")).toBe(true);
    expect(firstStep?.style.getPropertyValue("--sync-rotation")).toBe("32deg");
    expect(target.querySelector(".workspace-phase .pi-wifi")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(500);
    state.phase = "ready";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(target.querySelector(".workspace-phase .pi-wifi")).not.toBeNull();
    expect(target.querySelector(".workspace-phase .pi-clock")).toBeNull();

    state.phase = "temporarily_offline";
    state.syncActivity += 1;
    await nextTick();
    await nextTick();
    expect(firstStep?.classList.contains("is-visible")).toBe(false);

    state.phase = "unavailable";
    state.syncActivity += 1;
    await nextTick();
    await nextTick();
    expect(firstStep?.classList.contains("is-visible")).toBe(false);

    state.phase = "ready";
    await nextTick();
    expect(firstStep?.classList.contains("is-visible")).toBe(false);

    state.phase = "syncing";
    state.syncActivity += 1;
    await nextTick();
    await nextTick();
    expect(firstStep?.style.getPropertyValue("--sync-rotation")).toBe("64deg");

    await vi.advanceTimersByTimeAsync(999);
    expect(firstStep?.classList.contains("is-visible")).toBe(true);
    expect(target.querySelector(".workspace-phase .pi-wifi")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    await nextTick();
    expect(target.querySelector(".workspace-phase .pi")?.className).toContain("pi-clock");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(firstStep?.classList.contains("is-fading")).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(firstStep?.classList.contains("is-visible")).toBe(false);
    expect(target.querySelector('[role="list"]')).not.toBeNull();
    expect(target.querySelector('[title="Daria Muster"]')).not.toBeNull();
    wrapper.unmount();
  });
});
