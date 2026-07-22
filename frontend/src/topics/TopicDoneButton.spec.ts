import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TopicDoneButton from "./TopicDoneButton.vue";

const Button = {
  props: ["label", "icon"],
  emits: ["click"],
  template: `
    <button @click="$emit('click')">
      <i v-if="icon" :class="icon" />
      {{ label }}
    </button>
  `,
};

describe("TopicDoneButton", () => {
  it("shows compact completed feedback with a check and remains a toggle", async () => {
    const wrapper = mount(TopicDoneButton, {
      props: { done: true },
      global: { stubs: { Button } },
    });

    expect(wrapper.text()).toContain("done");
    expect(wrapper.get("i").classes()).toContain("pi-check");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });
});
