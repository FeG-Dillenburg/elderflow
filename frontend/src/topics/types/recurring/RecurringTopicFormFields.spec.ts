import { mount } from "@vue/test-utils";
import { h } from "vue";
import { describe, expect, it } from "vitest";
import RecurringTopicFormFields from "./RecurringTopicFormFields.vue";

describe("RecurringTopicFormFields", () => {
  it("emits recurrence configuration changes without losing local-date semantics", async () => {
    const wrapper = mount(RecurringTopicFormFields, {
      shallow: true,
      props: {
        modelValue: {
          name: "Review",
          type: "recurring",
          description: "Template",
          recurrenceFirstDueDate: "2026-08-01",
          recurrenceInterval: 3,
          recurrenceUnit: "months",
          defaultPosition: null,
        } as any,
      },
      global: {
        stubs: {
          DatePicker: {
            name: "DatePicker",
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template: "<input />",
          },
          InputNumber: {
            name: "InputNumber",
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template: "<input />",
          },
          Select: {
            name: "Select",
            props: ["modelValue"],
            emits: ["update:modelValue"],
            template: "<select />",
          },
          RichTextEditor: true,
        },
      },
    });
    const components = wrapper.findAllComponents({ name: "InputNumber" });
    const select = wrapper.findComponent({ name: "Select" });
    const datePicker = wrapper.findComponent({ name: "DatePicker" });

    await components[0].vm.$emit("update:modelValue", 2);
    await select.vm.$emit("update:modelValue", "weeks");
    await components[1].vm.$emit("update:modelValue", 4);
    await datePicker.vm.$emit("update:modelValue", new Date(2026, 8, 15));

    expect(wrapper.emitted("change")).toEqual([
      [{ recurrenceInterval: 2 }],
      [{ recurrenceUnit: "weeks" }],
      [{ defaultPosition: 4 }],
      [{ recurrenceFirstDueDate: "2026-09-15" }],
    ]);
  });

  it("places the caller-provided Default section before Default position", () => {
    const wrapper = mount(RecurringTopicFormFields, {
      shallow: true,
      props: {
        modelValue: {
          type: "recurring",
          recurrenceFirstDueDate: "2026-08-01",
          recurrenceInterval: 3,
          recurrenceUnit: "months",
        } as any,
      },
      slots: {
        default: () => h("label", { class: "default-section" }, "Default section"),
      },
    });
    const text = wrapper.text();

    expect(text.indexOf("Default section")).toBeLessThan(
      text.indexOf("Default position"),
    );
  });
});
