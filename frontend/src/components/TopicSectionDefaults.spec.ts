import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TopicFormFields from "./TopicFormFields.vue";
import Select from "primevue/select";
import TopicTypeRadioGroup from "../topics/components/TopicTypeRadioGroup.vue";

const sections = [
  { id: "general", name: "Discussion", position: 1, defaultTopicType: "generic" },
  { id: "people", name: "People", position: 2, defaultTopicType: "person" },
] as any;
const form = (initializeDefaults: boolean, defaultSectionId: string | null = null) => mount(TopicFormFields, {
  props: { id: "test", modelValue: { name: "Example", type: "generic", followUpDate: null, defaultSectionId }, users: [], sections, active: true, initializeDefaults },
  shallow: true,
});

describe("shared Topic section defaults", () => {
  it("initializes new Topics, replaces defaults on type change and clears unmapped types", async () => {
    const wrapper = form(true);
    expect(wrapper.emitted("change")?.[0]).toEqual([{ defaultSectionId: "general" }]);
    wrapper.getComponent(TopicTypeRadioGroup).vm.$emit("update:modelValue", "person");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ type: "person", defaultSectionId: "people" }]);
    wrapper.getComponent(TopicTypeRadioGroup).vm.$emit("update:modelValue", "recurring");
    expect(wrapper.emitted("change")?.at(-1)).toEqual([{ type: "recurring", defaultSectionId: null }]);
    wrapper.unmount();
  });
  it("waits for section references before applying a creation default", async () => {
    const wrapper = mount(TopicFormFields, {
      props: { id: "loading", modelValue: { name: "Example", type: "generic", followUpDate: null }, users: [], sections: [], active: true, initializeDefaults: true, defaultsReady: false },
      shallow: true,
    });
    expect(wrapper.emitted("change")).toBeUndefined();
    await wrapper.setProps({ sections, defaultsReady: true });
    expect(wrapper.emitted("change")?.[0]).toEqual([{ defaultSectionId: "general" }]);
    wrapper.unmount();
  });
  it("preserves an explicit selection made before references finish loading", async () => {
    const wrapper = mount(TopicFormFields, {
      props: { id: "loading", modelValue: { name: "Example", type: "generic", followUpDate: null }, users: [], sections: [], active: true, initializeDefaults: true, defaultsReady: false },
      shallow: true,
      global: { stubs: { TopicTypeRenderer: { template: "<div><slot /></div>" } } },
    });
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "individual");
    await wrapper.setProps({ sections, defaultsReady: true });
    expect(wrapper.emitted("change")).toEqual([[{ defaultSectionId: "individual" }]]);
    wrapper.unmount();
  });
  it.each([null, "individual"])("preserves an existing Topic section %s on open", (section) => {
    const wrapper = form(false, section);
    expect(wrapper.emitted("change")).toBeUndefined();
    wrapper.unmount();
  });
  it("does not reapply a default after an individual override or configuration refresh", async () => {
    const wrapper = form(true);
    await wrapper.setProps({ modelValue: { name: "Example", type: "generic", followUpDate: null, defaultSectionId: "individual" }, sections: [...sections] });
    expect(wrapper.emitted("change")).toHaveLength(1);
    wrapper.unmount();
  });
});
