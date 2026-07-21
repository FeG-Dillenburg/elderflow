import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MembershipInlineText from "./MembershipInlineText.vue";

const InputText = {
  props: ["modelValue"],
  emits: ["update:modelValue", "input", "blur"],
  template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value); $emit('input')" @blur="$emit('blur')" />`,
};

describe("MembershipInlineText", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces text, saves on blur, and serializes newer input after an older write", async () => {
    let resolveFirst!: () => void;
    const save = vi.fn()
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    const wrapper = mount(MembershipInlineText, {
      props: { value: "Initial", label: "Status", save },
      global: { stubs: { InputText } },
    });

    await wrapper.get("input").setValue("Older");
    await wrapper.get("input").trigger("blur");
    await wrapper.get("input").setValue("Newest");
    await wrapper.get("input").trigger("blur");
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith("Newest");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Newest");
  });

  it("retains failed input and exposes retry feedback", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValueOnce(undefined);
    const wrapper = mount(MembershipInlineText, {
      props: { value: null, label: "Godparents", save },
      global: { stubs: { InputText } },
    });

    await wrapper.get("input").setValue("Taylor");
    await wrapper.get("input").trigger("blur");
    await flushPromises();
    expect(wrapper.text()).toContain("Permission denied");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Taylor");

    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(save).toHaveBeenLastCalledWith("Taylor");
  });
});
