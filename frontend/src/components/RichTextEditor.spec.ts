import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import RichTextEditor from "./RichTextEditor.vue";

describe("RichTextEditor", () => {
  it("emits blur when the editor selection leaves the field", async () => {
    const wrapper = shallowMount(RichTextEditor);
    const editor = wrapper.getComponent({ name: "Editor" });

    await editor.vm.$emit("selection-change", {
      range: null,
      oldRange: { index: 0, length: 0 },
    });

    expect(wrapper.emitted("blur")).toHaveLength(1);
  });

  it("applies an accessible name and description to the editable root", async () => {
    const setAttribute = vi.fn();
    const wrapper = shallowMount(RichTextEditor, {
      props: {
        ariaLabel: "Meeting minutes",
        ariaDescription: "Minutes recorded during the Meeting.",
      },
    });

    await wrapper.getComponent({ name: "Editor" }).vm.$emit("load", {
      instance: { root: { setAttribute } },
    });

    expect(setAttribute).toHaveBeenCalledWith("aria-label", "Meeting minutes");
    expect(setAttribute).toHaveBeenCalledWith(
      "aria-description",
      "Minutes recorded during the Meeting.",
    );
  });
});
