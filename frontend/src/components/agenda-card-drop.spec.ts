import { enableAutoUnmount, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import type { Meeting } from "../api/domain";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import { createMeetingWorkspace, meetingRouteFactoryKey, useMeetingRoute } from "../meetings/workspace";
import MeetingCollaborativeTextEditor from "../meetings/workspace/MeetingCollaborativeTextEditor.vue";
import RichTextEditorFrame from "./RichTextEditorFrame.vue";

enableAutoUnmount(afterEach);
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

const mountEditors = async (collaborative: boolean) => {
  const document = new Y.Doc();
  const awareness = new Awareness(document);
  vi.spyOn(meetingCollaboration, "get").mockReturnValue(collaborative
    ? { document, awareness } as never
    : undefined);
  const meeting = { id: "drag-test", status: "planned", generalNotes: "", openingInput: "" } as Meeting;
  const workspace = createMeetingWorkspace(meeting.id, {
    load: async () => ({ meeting, unlocked: true, collaborative: false }),
    complete: vi.fn(),
  });
  await workspace.open();
  cleanups.push(() => {
    workspace.forceClose("unmount");
    awareness.destroy();
    document.destroy();
  });
  const Harness = defineComponent({
    setup() {
      useMeetingRoute(meeting.id);
      const first = ref("<p>Original preparation</p>");
      const second = ref("<p>Other preparation</p>");
      return () => h("section", [first, second].map((value, index) =>
        h(MeetingCollaborativeTextEditor, {
          target: { kind: index === 0 ? "general_notes" : "opening_input" },
          modelValue: value.value,
          "onUpdate:modelValue": (next: string) => { value.value = next; },
        })));
    },
  });
  const wrapper = mount(Harness, { global: { provide: {
    [meetingRouteFactoryKey as symbol]: () => ({ workspace, opened: Promise.resolve(), operations: {} }),
  } } });
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  const editors = wrapper.findAllComponents(RichTextEditorFrame).map((frame) => frame.props("editor") as Editor);
  for (const editor of editors) {
    vi.spyOn(editor.view, "posAtCoords").mockImplementation(() => ({
      pos: editor.state.doc.content.size - 1,
      inside: -1,
    }));
  }
  return { wrapper, editors };
};

const transfer = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    files: [],
    get types() { return [...values.keys()]; },
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value),
    clearData: () => values.clear(),
  };
};

const dispatchTransfer = (editor: Editor, type: string, data: ReturnType<typeof transfer>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", { value: data });
  editor.view.dom.dispatchEvent(event);
  return event;
};

it.each([false, true])("rejects repeated card drops over own and other editors (collaborative: %s)", async (collaborative) => {
  const { wrapper, editors } = await mountEditors(collaborative);
  const parentDrop = vi.fn();
  wrapper.element.addEventListener("drop", parentDrop);
  for (let round = 0; round < 3; round += 1) {
    for (const editor of editors) {
      const event = dispatchTransfer(editor, "drop", transfer({
        "application/x-elderflow-agenda-card": "1",
        "text/plain": "Topic title BIUA 🔗 Collaborator Original preparation",
        "text/html": "<p>Topic title <b>B</b> Original preparation</p>",
      }));
      expect(event.defaultPrevented).toBe(true);
    }
  }
  expect(editors.map((editor) => editor.getHTML())).toEqual([
    "<p>Original preparation</p>", "<p>Other preparation</p>",
  ]);
  expect(parentDrop).toHaveBeenCalledTimes(6);
});

it.each([false, true])("preserves ordinary text drops and rich-text paste (collaborative: %s)", async (collaborative) => {
  const { editors: [editor] } = await mountEditors(collaborative);
  dispatchTransfer(editor, "drop", transfer({ "text/plain": " External text" }));
  expect(editor.getText()).toBe("Original preparation External text");
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  dispatchTransfer(editor, "paste", transfer({
    "text/plain": " Pasted text",
    "text/html": "<strong>Pasted text</strong>",
  }));
  expect(editor.getHTML()).toContain("<strong>Pasted text</strong>");
});

it.each([false, true])("preserves text dragging within and between editors (collaborative: %s)", async (collaborative) => {
  const { editors: [source, target] } = await mountEditors(collaborative);
  source.commands.setContent("<p>Alpha Beta</p>");
  source.commands.setTextSelection({ from: 1, to: 7 });
  const internal = transfer();
  dispatchTransfer(source, "dragstart", internal);
  dispatchTransfer(source, "drop", internal);
  expect(source.getText()).toBe("BetaAlpha ");

  source.commands.setTextSelection({ from: 1, to: 5 });
  const external = transfer();
  dispatchTransfer(source, "dragstart", external);
  dispatchTransfer(target, "drop", external);
  expect(target.getText()).toBe("Other preparationBeta");
});
