import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersonTopicNote from "./PersonTopicNote.vue";

const item = () => ({
  id: "appearance",
  meetingId: "meeting",
  topicId: "topic",
  personNote: { id: "appearance", text: "Initial note", version: 0 },
}) as any;

const RichTextEditor = {
  name: "RichTextEditor",
  props: ["modelValue", "ariaLabel", "meetingId", "fragment"],
  emits: ["update:modelValue", "blur"],
  template: `<textarea
    :value="modelValue"
    :aria-label="ariaLabel"
    @input="$emit('update:modelValue', $event.target.value)"
    @blur="$emit('blur')"
  />`,
};

const mountNote = (
  props: Record<string, unknown>,
  slots: Record<string, string> = {},
) => mount(PersonTopicNote, {
  props: props as any,
  slots,
  global: { stubs: { RichTextEditor } },
});

describe("PersonTopicNote", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("saves after a debounce and announces success", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({ ...item(), agendaNote: "New note" });
    const wrapper = mountNote({ item: item(), readOnly: false, save });

    await wrapper.get("textarea").setValue("New note");
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(save).toHaveBeenCalledWith("New note");
    expect(wrapper.get('[role="status"]').text()).toBe("Saved");
  });

  it("saves immediately on blur", async () => {
    const save = vi.fn().mockResolvedValue({ ...item(), agendaNote: "Blurred note" });
    const wrapper = mountNote({ item: item(), readOnly: false, save });

    await wrapper.get("textarea").setValue("Blurred note");
    await wrapper.get("textarea").trigger("blur");
    await flushPromises();

    expect(save).toHaveBeenCalledWith("Blurred note");
  });

  it("retains failed input and retries it", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce({ ...item(), agendaNote: "Retained note" });
    const wrapper = mountNote({ item: item(), readOnly: false, save });

    await wrapper.get("textarea").setValue("Retained note");
    await wrapper.get("textarea").trigger("blur");
    await flushPromises();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Retained note");
    expect(wrapper.text()).toContain("Permission denied");

    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith("Retained note");
    expect(wrapper.get('[role="status"]').text()).toBe("Saved");
  });

  it("serializes saves so a stale response cannot replace newer local input", async () => {
    let resolveFirst!: (value: any) => void;
    const save = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ...item(), agendaNote: "Newest note" });
    const wrapper = mountNote({ item: item(), readOnly: false, save });

    await wrapper.get("textarea").setValue("Older note");
    await wrapper.get("textarea").trigger("blur");
    expect(wrapper.get(".note-editor").attributes("aria-busy")).toBe("true");
    expect(wrapper.get("textarea").attributes("aria-label")).toBe("Meeting topic note");
    expect(wrapper.get('[role="status"]').attributes("aria-live")).toBe("polite");
    await wrapper.get("textarea").setValue("Newest note");
    await wrapper.get("textarea").trigger("blur");
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst({ ...item(), agendaNote: "Older note" });
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("Newest note");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Newest note");
    expect(wrapper.get(".note-editor").attributes("aria-busy")).toBe("false");
  });

  it("renders completed notes as plain read-only text", () => {
    const wrapper = mountNote({ item: item(), readOnly: true, save: async () => item() });

    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.text()).toContain("Initial note");
  });

  it("binds the Person note to its isolated collaborative fragment", async () => {
    const wrapper = mountNote(
      { item: item(), readOnly: false, save: async () => item() },
      { label: '<a href="/topics/topic">Alex:</a>' },
    );
    await flushPromises();

    expect(wrapper.get(".inline-label").text()).toBe("Alex:");
    expect(wrapper.getComponent({ name: "RichTextEditor" }).props()).toMatchObject({
      meetingId: "meeting",
      fragment: "appearance/appearance/person-note",
    });
  });
});
