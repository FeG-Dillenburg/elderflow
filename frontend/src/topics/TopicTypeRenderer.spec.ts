import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TopicTypeRenderer from "./TopicTypeRenderer.vue";
import GenericTopicFormFields from "./types/generic/GenericTopicFormFields.vue";
import GenericTopicPreparation from "./types/generic/GenericTopicPreparation.vue";

describe("TopicTypeRenderer", () => {
  it.each(["form", "preparation", "agenda", "detail", "list"] as const)(
    "dispatches Generic through the %s context",
    (context) => {
      const topic = { id: "topic", name: "Topic", type: "generic" } as any;
      const contextProps = context === "form"
        ? { modelValue: { type: "generic", description: null } }
        : context === "agenda"
          ? { item: { topic } }
          : { topic };
      const wrapper = mount(TopicTypeRenderer, {
        shallow: true,
        props: { type: "generic", context },
        attrs: contextProps,
      });
      expect(wrapper.find(`[data-v-app]`).exists()).toBe(false);
      expect(wrapper.find("message-stub").exists()).toBe(false);
      expect(wrapper.html()).toContain(`generic-topic-${context === "form" ? "form-fields" : context}-stub`);
    },
  );

  it("renders a localized visible error for an unknown discriminator", () => {
    const wrapper = mount(TopicTypeRenderer, {
      shallow: true,
      props: { type: "legacy", context: "detail" },
      global: {
        stubs: { Message: { template: "<div><slot /></div>" } },
      },
    });
    expect(wrapper.text()).toContain("Unknown Topic type");
  });

  it("emits a semantic description patch instead of persisting from the child", async () => {
    const wrapper = mount(GenericTopicFormFields, {
      shallow: true,
      props: {
        modelValue: { type: "generic", description: null } as any,
      },
    });

    await wrapper.findComponent({ name: "RichTextEditor" }).vm.$emit(
      "update:modelValue",
      "<p>Context</p>",
    );

    expect(wrapper.emitted("change")?.[0]).toEqual([
      { description: "<p>Context</p>" },
    ]);
  });

  it("preserves the one-line preparation suggestion metadata", () => {
    const wrapper = mount(GenericTopicPreparation, {
      props: {
        topic: {
          name: "Topic",
          type: "generic",
          followUpDate: "2026-07-20",
        } as any,
        showType: true,
      },
    });

    expect(wrapper.find("small").text().replace(/\s+/g, " ")).toBe(
      "Generic · 7/20/2026",
    );
  });
});
