import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PairedMeetingTexts from "./PairedMeetingTexts.vue";

const item = () => ({
  id: "appearance",
  preparationContext: {
    id: "appearance",
    text: "<p>Prepared context</p>",
    version: 1,
  },
  meetingMinutes: null,
}) as any;

const RichTextEditor = {
  props: ["modelValue", "placeholder"],
  emits: ["update:modelValue", "blur"],
  template: `<textarea
    :aria-label="placeholder"
    :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value)"
    @blur="$emit('blur')"
  />`,
};

describe("PairedMeetingTexts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("edits only preparation context during preparation and saves on blur", async () => {
    const savePreparation = vi.fn().mockResolvedValue({});
    const wrapper = mount(PairedMeetingTexts, {
      props: {
        item: item(),
        mode: "preparation",
        savePreparation,
        saveMinutes: vi.fn(),
      },
      global: { stubs: { RichTextEditor } },
    });

    expect(wrapper.text()).toContain("Preparation context");
    expect(wrapper.text()).not.toContain("Meeting minutes");
    await wrapper.get("textarea").setValue("<p>Revised context</p>");
    await wrapper.get("textarea").trigger("blur");
    await flushPromises();

    expect(savePreparation).toHaveBeenCalledWith("<p>Revised context</p>");
    expect(wrapper.get('[role="status"]').text()).toBe("Saved");
  });

  it("shows preparation read-only above directly editable Minutes in an active Meeting", async () => {
    vi.useFakeTimers();
    const saveMinutes = vi.fn().mockResolvedValue({});
    const wrapper = mount(PairedMeetingTexts, {
      props: {
        item: item(),
        mode: "active",
        canWriteMinutes: true,
        savePreparation: vi.fn(),
        saveMinutes,
      },
      global: { stubs: { RichTextEditor } },
    });

    expect(wrapper.get(".preparation-context").text()).toContain("Prepared context");
    expect(wrapper.findAll("textarea")).toHaveLength(1);
    expect(wrapper.get("textarea").attributes("aria-label")).toBe("Meeting minutes");
    await wrapper.get("textarea").setValue("<p>Decision recorded</p>");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(saveMinutes).toHaveBeenCalledWith("<p>Decision recorded</p>");
    expect(wrapper.get(".minutes-field").attributes("aria-busy")).toBe("false");
  });

  it("retains failed Minutes input and exposes a localized retry", async () => {
    const saveMinutes = vi.fn()
      .mockRejectedValueOnce(new Error("Stale write"))
      .mockResolvedValueOnce({});
    const wrapper = mount(PairedMeetingTexts, {
      props: {
        item: item(),
        mode: "active",
        canWriteMinutes: true,
        savePreparation: vi.fn(),
        saveMinutes,
      },
      global: { stubs: { RichTextEditor } },
    });

    await wrapper.get("textarea").setValue("<p>Keep this</p>");
    await wrapper.get("textarea").trigger("blur");
    await flushPromises();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value)
      .toBe("<p>Keep this</p>");
    expect(wrapper.get('[role="alert"]').text()).toContain("Stale write");
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(saveMinutes).toHaveBeenCalledTimes(2);
  });

  it("renders both values read-only after completion", () => {
    const completed = item();
    completed.meetingMinutes = {
      id: "minute",
      text: "<p>Final Minutes</p>",
      version: 2,
    };
    const wrapper = mount(PairedMeetingTexts, {
      props: {
        item: completed,
        mode: "completed",
        savePreparation: vi.fn(),
        saveMinutes: vi.fn(),
      },
      global: { stubs: { RichTextEditor } },
    });

    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.text()).toContain("Prepared context");
    expect(wrapper.text()).toContain("Final Minutes");
  });
});
