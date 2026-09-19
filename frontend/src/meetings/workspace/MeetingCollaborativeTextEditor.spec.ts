import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import RichTextEditor from "../../components/RichTextEditor.vue";
import MeetingCollaborativeTextEditor from "./MeetingCollaborativeTextEditor.vue";
import {
  createMeetingWorkspace,
  type MeetingWorkspaceCollaboration,
} from "./core";
import { meetingRouteFactoryKey, useMeetingRoute } from "./vue";

const meeting = {
  id: "meeting-1",
  title: "Council",
  date: "2026-09-19",
  beginTime: "19:30",
  status: "planned",
  meetingLeaderId: null,
  minuteTakerId: null,
  generalNotes: "",
  openingInput: "",
} as Meeting;

describe("MeetingCollaborativeTextEditor", () => {
  it("keeps focus while an edit moves the workspace into syncing", async () => {
    let notify: ((change?: "state" | "document") => void) | undefined;
    const collaboration: MeetingWorkspaceCollaboration = {
      phase: "ready",
      pending: false,
      collaborators: [],
      subscribe(listener) {
        notify = listener;
        return () => undefined;
      },
      close: vi.fn(),
      complete: vi.fn(),
    };
    const workspace = createMeetingWorkspace(meeting.id, {
      load: vi.fn(async () => ({ meeting, unlocked: true })),
      connect: vi.fn(async () => collaboration),
      complete: vi.fn(),
      updateText: vi.fn(),
    });
    await workspace.open();
    const Harness = defineComponent({
      setup() {
        useMeetingRoute(meeting.id);
        const value = ref("");
        return () => h(MeetingCollaborativeTextEditor, {
          target: { kind: "general_notes" },
          modelValue: value.value,
          "onUpdate:modelValue": (next: string) => {
            value.value = next;
            if (next.includes("A")) {
              Object.assign(collaboration, { phase: "syncing", pending: true });
              notify?.("state");
            }
          },
        });
      },
    });
    const wrapper = mount(Harness, {
      attachTo: document.body,
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
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const surface = wrapper.get('[contenteditable="true"]');
    (surface.element as HTMLElement).focus();

    const editor = (wrapper.getComponent(RichTextEditor).vm as any).editor;
    editor.commands.insertContent("A");
    await nextTick();

    expect(workspace.state.phase).toBe("syncing");
    expect(surface.attributes("contenteditable")).toBe("true");
    expect(document.activeElement).toBe(surface.element);
    wrapper.unmount();
    await workspace.close();
  });
});
