import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import MeetingWorkspaceStatus from "./MeetingWorkspaceStatus.vue";
import type { MeetingWorkspace, MeetingWorkspaceState } from "./core";
import { meetingRouteFactoryKey, useMeetingRoute } from "./vue";

const meeting = {
  id: "meeting-1",
  status: "planned",
} as Meeting;

describe("MeetingWorkspaceStatus", () => {
  afterEach(() => document.querySelector("#meeting-workspace-status")?.remove());

  it("presents the workspace phase, pending changes, and collaborators", () => {
    const target = document.createElement("div");
    target.id = "meeting-workspace-status";
    document.body.append(target);
    const state = reactive<MeetingWorkspaceState>({
      phase: "syncing",
      meeting,
      pendingChanges: true,
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

    expect(target.textContent).toContain("Synchronizing encrypted Meeting changes");
    expect(target.textContent).toContain("Encrypted changes pending");
    expect(target.querySelector('[role="list"]')).not.toBeNull();
    expect(target.querySelector('[title="Daria Muster"]')).not.toBeNull();
    wrapper.unmount();
  });
});
