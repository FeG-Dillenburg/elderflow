import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import RichTextEditor from "./RichTextEditor.vue";

const editorMounted = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe("RichTextEditor", () => {
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
});
