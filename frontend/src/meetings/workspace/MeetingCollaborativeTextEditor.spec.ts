import { mount } from "@vue/test-utils";
import type { Editor } from "@tiptap/core";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import RichTextEditor from "../../components/RichTextEditor.vue";
import RichTextEditorFrame from "../../components/RichTextEditorFrame.vue";
import { meetingCollaboration } from "../../e2ee/meeting-collaboration";
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
  afterEach(() => vi.restoreAllMocks());

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

  it.each(["ready", "opening"] as const)("preserves collaborative editing when mounted during %s", async (phase) => {
    const document = new Y.Doc();
    const awareness = new Awareness(document);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: meeting.id,
      document,
      awareness,
    } as never);
    let notify: (() => void) | undefined;
    const collaboration: MeetingWorkspaceCollaboration = {
      phase,
      pending: false,
      collaborators: [],
      subscribe(listener) {
        notify = listener;
        return () => undefined;
      },
      close: vi.fn(),
    };
    const workspace = createMeetingWorkspace(meeting.id, {
      load: async () => ({ meeting, unlocked: true }),
      connect: async () => collaboration,
      complete: vi.fn(),
    });
    await workspace.open();
    const Harness = defineComponent({
      setup() {
        useMeetingRoute(meeting.id);
        return () => h(MeetingCollaborativeTextEditor, {
          target: { kind: "general_notes" },
        });
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
    await nextTick();
    const editor = wrapper.getComponent(RichTextEditorFrame).props("editor") as Editor;
    expect(editor.isEditable).toBe(true);
    Object.assign(collaboration, { phase: "ready" });
    notify?.();
    await nextTick();
    expect(wrapper.getComponent(RichTextEditorFrame).props("editor")).toBe(editor);
    const caretExtension = editor.extensionManager.extensions
      .find((extension: { name: string }) => extension.name === "collaborationCaret");
    if (!caretExtension) throw new Error("Collaboration caret extension missing");

    const caret = caretExtension.options.render({
      color: "#123456",
      name: "Daria Muster",
    }) as HTMLElement;

    expect(caret.classList.contains("collaboration-carets__caret")).toBe(true);
    expect(caret.style.getPropertyValue("--collaborator-color")).toBe("#123456");
    expect(caret.querySelector(".collaboration-carets__marker")).not.toBeNull();
    expect(caret.querySelector(".collaboration-carets__label")).toBeNull();

    wrapper.unmount();
    workspace.forceClose("unmount");
    awareness.destroy();
    document.destroy();
  });
});
