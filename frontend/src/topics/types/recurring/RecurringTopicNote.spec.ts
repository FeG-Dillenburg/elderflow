import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import RecurringTopicNote from "./RecurringTopicNote.vue";

const item = (agendaNote: string | null = null) => ({
  id: "appearance",
  topicId: "topic",
  agendaNote,
});

const richTextEditorStub = {
  name: "RichTextEditor",
  props: ["modelValue", "height", "placeholder"],
  emits: ["update:modelValue"],
  template: `
    <textarea
      class="rich-text-editor"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
};

describe("RecurringTopicNote", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("edits and autosaves the Meeting topic note as rich text", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(item("<p>Saved</p>"));
    const wrapper = mount(RecurringTopicNote, {
      props: {
        item: item("<p>Draft</p>") as any,
        readOnly: false,
        save,
      },
      global: { stubs: { RichTextEditor: richTextEditorStub } },
    });

    expect((wrapper.get(".rich-text-editor").element as HTMLTextAreaElement).value)
      .toBe("<p>Draft</p>");

    await wrapper.get(".rich-text-editor").setValue("<p><strong>Saved</strong></p>");
    await vi.advanceTimersByTimeAsync(600);

    expect(save).toHaveBeenCalledWith("<p><strong>Saved</strong></p>");
    expect(wrapper.text()).toContain("Saved");
  });

  it("renders sanitized rich text when the Meeting is read-only", () => {
    const wrapper = mount(RecurringTopicNote, {
      props: {
        item: item('<p>Final <strong>note</strong></p><script>alert("x")</script>') as any,
        readOnly: true,
        save: vi.fn(),
      },
      global: { stubs: { RichTextEditor: richTextEditorStub } },
    });

    expect(wrapper.get(".read-only-note strong").text()).toBe("note");
    expect(wrapper.find("script").exists()).toBe(false);
  });
});
