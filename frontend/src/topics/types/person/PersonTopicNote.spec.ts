import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersonTopicNote from "./PersonTopicNote.vue";

const item = () => ({
  id: "appearance",
  meetingId: "meeting",
  topicId: "topic",
  agendaNote: "Initial note",
}) as any;

const Textarea = {
  props: ["modelValue"],
  emits: ["update:modelValue", "input", "blur"],
  template: `<textarea
    :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value); $emit('input', $event)"
    @blur="$emit('blur')"
  />`,
};

const mountNote = (
  props: Record<string, unknown>,
  slots: Record<string, string> = {},
) => mount(PersonTopicNote, {
  props: props as any,
  slots,
  global: { stubs: { Textarea } },
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

  it("indents only the first editable line around a measured Person label", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 96,
    } as DOMRect);
    const wrapper = mountNote(
      { item: item(), readOnly: false, save: async () => item() },
      { label: '<a href="/topics/topic">Alex:</a>' },
    );
    await flushPromises();

    expect(wrapper.get(".inline-label").text()).toBe("Alex:");
    expect(wrapper.get("textarea").attributes("style")).toContain(
      "--inline-label-indent: 102px",
    );
  });
});
