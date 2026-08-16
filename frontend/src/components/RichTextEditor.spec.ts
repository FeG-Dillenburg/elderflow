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
    applyAwarenessUpdate(
      awareness,
      encodeAwarenessUpdate(remoteAwareness, [remoteDocument.clientID]),
      "test",
    );
    await nextTick();

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2);
    expect(wrapper.find('[aria-label="Daniel Haas is collaborating live"]').text()).toBe("DH");
    expect(wrapper.find('[aria-label="Daria Muster is collaborating live"]').text()).toBe("DM");

    wrapper.unmount();
    awareness.destroy();
    remoteAwareness.destroy();
    document.destroy();
    remoteDocument.destroy();
  });
});
