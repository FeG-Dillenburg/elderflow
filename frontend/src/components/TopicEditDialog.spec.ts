import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import TopicEditDialog from "./TopicEditDialog.vue";
const stubs = {
  Button: true,
  Checkbox: true,
  DatePicker: true,
  Dialog: true,
  InputText: true,
  Select: true,
  RichTextEditor: true,
};
const topic: any = {
  id: "topic",
  name: "Old",
  description: "Text",
  type: "general",
  status: "open",
  followUpDate: "2026-07-15",
  responsibleUserId: "user",
  isRecurring: true,
  defaultSectionId: "section",
  defaultPosition: 3,
};
describe("TopicEditDialog", () => {
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
});
