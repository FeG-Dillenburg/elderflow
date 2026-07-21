import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import TopicTypeRadioGroup from "../topics/components/TopicTypeRadioGroup.vue";
import TopicEditDialog from "./TopicEditDialog.vue";
const stubs = {
  Button: true,
  Checkbox: true,
  DatePicker: true,
  Dialog: true,
  InputText: true,
  RadioButton: true,
  Select: true,
  RichTextEditor: true,
};
const topic: any = {
  id: "topic",
  name: "Old",
  description: "Text",
  type: "generic",
  status: "open",
  followUpDate: "2026-07-15",
  responsibleUserId: "user",
  isRecurring: true,
  defaultSectionId: "section",
  defaultPosition: 3,
};
describe("TopicEditDialog", () => {
  it("submits and closes from the dialog footer save button", async () => {
    vi.spyOn(api, "updateTopic").mockResolvedValue({} as any);
    const wrapper = mount(TopicEditDialog, {
      props: {
        topic: {
          ...topic,
          type: "new_membership",
          membershipProcessStatus: "Dangerous!",
          membershipStatusSignal: "attention",
          godparents: "Luke Skywalker",
        },
        users: [],
        sections: [],
        visible: true,
      },
      global: {
        stubs: {
          ...stubs,
          Button: {
            props: ["label"],
            emits: ["click"],
            template: "<button type='button' :data-label='label' @click='$emit(\"click\")'>{{ label }}</button>",
          },
          Dialog: {
            template: "<div><slot /><slot name='footer' /></div>",
          },
          TopicTypeRadioGroup: true,
          TopicTypeRenderer: true,
        },
      },
    });

    await wrapper.get('button[data-label="Save topic"]').trigger("click");
    await flushPromises();

    expect(api.updateTopic).toHaveBeenCalledOnce();
    expect(wrapper.emitted("saved")).toHaveLength(1);
    expect(wrapper.emitted("update:visible")?.[0]).toEqual([false]);
  });

  it("repopulates all fields on prop changes and saves full mapped input", async () => {
    vi.spyOn(api, "updateTopic").mockResolvedValue({} as any);
    const wrapper = mount(TopicEditDialog, {
      shallow: true,
      props: { topic, users: [], sections: [], visible: true },
      global: { stubs },
    });
    await flushPromises();
    const vm: any = wrapper.vm;
    expect(vm.form.followUpDate).toBeInstanceOf(Date);
    await wrapper.setProps({
      topic: {
        ...topic,
        name: "New",
        followUpDate: null,
        status: "deferred",
        defaultPosition: null,
      },
    });
    expect(vm.form.name).toBe("New");
    expect(vm.form.followUpDate).toBeNull();
    vm.form.followUpDate = new Date(2026, 6, 20);
    await vm.save();
    expect(api.updateTopic).toHaveBeenCalledWith(
      "topic",
      expect.objectContaining({
        name: "New",
        followUpDate: "2026-07-20",
        defaultPosition: null,
      }),
    );
    expect(wrapper.emitted("saved")).toHaveLength(1);
    expect(wrapper.emitted("update:visible")?.[0]).toEqual([false]);
  });

  it("keeps the dialog open and reports a failed save", async () => {
    vi.spyOn(api, "updateTopic").mockRejectedValue(new Error("Update rejected"));
    const wrapper = mount(TopicEditDialog, {
      props: { topic, users: [], sections: [], visible: true },
      global: {
        stubs: {
          ...stubs,
          Dialog: {
            template: "<div><slot /><slot name='footer' /></div>",
          },
          Message: { template: "<div><slot /></div>" },
          TopicTypeRadioGroup: true,
          TopicTypeRenderer: true,
        },
      },
    });

    await expect((wrapper.vm as any).save()).resolves.toBeUndefined();

    expect(wrapper.text()).toContain("Update rejected");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.emitted("update:visible")).toBeUndefined();
  });

  it("edits a Person Topic without changing its discriminator", async () => {
    vi.spyOn(api, "updateTopic").mockResolvedValue({} as any);
    const wrapper = mount(TopicEditDialog, {
      shallow: true,
      props: {
        topic: { ...topic, type: "person", name: "Alex and Sam" },
        users: [],
        sections: [],
        visible: true,
      },
      global: { stubs },
    });
    const vm: any = wrapper.vm;

    expect(vm.form.type).toBe("person");
    expect(vm.form.name).toBe("Alex and Sam");
    await vm.save();
    expect(api.updateTopic).toHaveBeenCalledWith(
      "topic",
      expect.objectContaining({ type: "person", name: "Alex and Sam" }),
    );
  });

  it("passes a recurring Default section into the type-specific form layout", () => {
    const wrapper = mount(TopicEditDialog, {
      shallow: true,
      props: {
        topic: { ...topic, type: "recurring" },
        users: [],
        sections: [],
        visible: true,
      },
      global: {
        stubs: {
          ...stubs,
          Dialog: { template: "<div><slot /></div>" },
          TopicTypeRenderer: {
            template: '<div class="topic-type-renderer"><slot /></div>',
          },
        },
      },
    });

    expect(wrapper.find(".topic-type-renderer").text())
      .toContain("Default section");
    expect(wrapper.findAll("#edit-topic > label")).toHaveLength(0);
  });

  it("disables type choices after the Topic has appeared in a Meeting", () => {
    const wrapper = mount(TopicEditDialog, {
      props: {
        topic,
        users: [],
        sections: [],
        typeLocked: true,
        visible: true,
      },
      global: {
        stubs: {
          ...stubs,
          Dialog: { template: "<div><slot /><slot name='footer' /></div>" },
          TopicTypeRenderer: true,
        },
      },
    });

    expect(wrapper.findComponent(TopicTypeRadioGroup).props("disabled"))
      .toBe(true);
    const radios = wrapper.findAllComponents({ name: "RadioButton" });
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.every((radio) => radio.attributes("disabled") === "true"))
      .toBe(true);
    expect(wrapper.text()).toContain(
      "The Topic type cannot be changed after the Topic has appeared in a Meeting.",
    );
  });
});
