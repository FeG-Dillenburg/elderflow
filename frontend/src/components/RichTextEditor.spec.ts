import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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
});
