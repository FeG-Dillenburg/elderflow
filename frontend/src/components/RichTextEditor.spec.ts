import { mount } from "@vue/test-utils";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth/auth";
import { createCollaboratorPresentation } from "../e2ee/collaborator-presentation";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import { meetingFragmentId } from "../e2ee/meeting-document-codec";
import RichTextEditor from "./RichTextEditor.vue";

const editorMounted = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe("RichTextEditor", () => {
  afterEach(() => {
    auth.completeInitialization(null);
    vi.restoreAllMocks();
  });

  it("offers every approved rich-text command with accessible labels", async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        ariaLabel: "Meeting minutes",
        ariaDescription: "Minutes recorded during the Meeting.",
      },
    });
    await editorMounted();

    expect(wrapper.find('[contenteditable="true"]').attributes()).toMatchObject({
      "aria-label": "Meeting minutes",
      "aria-description": "Minutes recorded during the Meeting.",
    });
    expect(wrapper.findAll("[aria-label]").map((control) => control.attributes("aria-label")))
      .toEqual(expect.arrayContaining([
        "Bold", "Italic", "Underline", "Text color", "Highlight color",
        "Block quote", "Numbered list", "Bulleted list", "Insert link",
      ]));
  });

  it("renders read-only content without an editable surface", async () => {
    const wrapper = mount(RichTextEditor, { props: { readonly: true } });
    await editorMounted();

    expect(wrapper.find('[contenteditable="false"]').exists()).toBe(true);
  });

  it("does not format text entered into a newly focused editor with an empty nullable model in bold", async () => {
    const wrapper = mount(RichTextEditor, {
      props: { modelValue: null as any },
    });
    await editorMounted();

    const editor = (wrapper.vm as any).editor;
    expect(editor.isActive("bold")).toBe(false);
    editor.commands.focus("end");
    editor.commands.insertContent("New topic text");
    expect(editor.getHTML()).not.toContain("<strong>New topic text</strong>");
  });

  it("does not retain bold formatting in a newly focused collaborative editor", async () => {
    const document = new Y.Doc();
    const awareness = new Awareness(document);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: "meeting",
      document,
      awareness,
    } as any);
    const wrapper = mount(RichTextEditor, {
      props: {
        meetingId: "meeting",
        fragment: meetingFragmentId("meetingMinutes", "appearance"),
      },
    });
    await editorMounted();

    const editor = (wrapper.vm as any).editor;
    editor.commands.focus("end");
    editor.commands.insertContent("Meeting opening");

    expect(editor.getHTML()).not.toContain("<strong>Meeting opening</strong>");

    wrapper.unmount();
    awareness.destroy();
    document.destroy();
  });

  it("clears a stale bold mark before typing into an empty editor", async () => {
    const wrapper = mount(RichTextEditor);
    await editorMounted();

    const editor = (wrapper.vm as any).editor;
    editor.commands.focus("end");
    editor.view.dispatch(editor.state.tr.setStoredMarks([
      editor.schema.marks.bold.create(),
    ]));
    editor.options.onFocus({ editor });
    editor.commands.insertContent("Plain text");

    expect(editor.getHTML()).not.toContain("<strong>Plain text</strong>");
  });

  it("supports a compact toolbar-free surface with first-line indentation", async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        toolbar: false,
        compact: true,
        height: "22px",
        firstLineIndent: "120px",
      },
    });
    await editorMounted();

    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false);
    expect(wrapper.get(".rich-text-editor").classes()).toContain("compact");
    expect(wrapper.get(".rich-text-editor").attributes("style"))
      .toContain("--editor-first-line-indent: 120px");
  });

  it("shows live document collaborators with their initials and colors", async () => {
    const document = new Y.Doc();
    const awareness = new Awareness(document);
    const remoteDocument = new Y.Doc();
    const remoteAwareness = new Awareness(remoteDocument);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: "meeting",
      document,
      awareness,
    } as any);
    auth.completeInitialization({
      id: "daniel",
      firstName: "Daniel",
      lastName: "Haas",
    } as any);
    const wrapper = mount(RichTextEditor, {
      props: {
        meetingId: "meeting",
        fragment: meetingFragmentId("meetingMinutes", "appearance"),
      },
    });
    await editorMounted();

    const daria = createCollaboratorPresentation({
      id: "daria",
      firstName: "Daria",
      lastName: "Muster",
    });
    remoteAwareness.setLocalStateField("user", daria);
    remoteAwareness.setLocalStateField("cursor", { anchor: 1, head: 1 });
    applyAwarenessUpdate(
      awareness,
      encodeAwarenessUpdate(remoteAwareness, [remoteDocument.clientID]),
      "test",
    );
    await nextTick();

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Daria Muster is collaborating live"]').text()).toBe("DM");

    await wrapper.get('[contenteditable="true"]').trigger("focus");
    await nextTick();

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2);
    expect(wrapper.find('[aria-label="Daniel Haas is collaborating live"]').text()).toBe("DH");

    await wrapper.get('[contenteditable="true"]').trigger("blur");
    await nextTick();

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1);

    wrapper.unmount();
    awareness.destroy();
    remoteAwareness.destroy();
    document.destroy();
    remoteDocument.destroy();
  });
});
