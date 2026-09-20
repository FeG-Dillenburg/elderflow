import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import MeetingWorkspaceStatus from "./MeetingWorkspaceStatus.vue";
import type { MeetingWorkspace, MeetingWorkspaceState } from "./core";
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
