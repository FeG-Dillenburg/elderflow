import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import { setLanguage } from "../i18n";
import TopicEditDialog from "./TopicEditDialog.vue";

// Exercise the rendered dialog, including real PrimeVue inputs and Tiptap.
const mountDialog = (type = "generic") => mount(TopicEditDialog, {
  props: {
    visible: true,
    topic: {
      id: "topic", name: "A long topic name", type, status: "open",
      description: "<p>Background</p>", responsibleUserId: "user",
      defaultSectionId: "section", defaultPosition: 3,
      recurrenceFirstDueDate: "2026-10-01", recurrenceInterval: 2,
      recurrenceUnit: "weeks", followUpDate: null,
    } as any,
    users: [{ id: "user", firstName: "Alex", lastName: "Smith", role: "admin", isActive: true }] as any,
    sections: [{ id: "section", name: "General" }] as any,
  },
  global: {
    plugins: [PrimeVue],
    stubs: { Dialog: { template: '<div><slot /><slot name="footer" /></div>' }, Select: false },
  },
});

describe("Topic dialog layout", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
    }));
  });
  it("keeps the assignment visible in a collapsed disclosure without losing values", async () => {
    const wrapper = mountDialog();
    const details = wrapper.get("details");
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    expect(details.get("summary").text()).toContain("Alex Smith");
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger("toggle");
    expect(details.text()).toContain("Responsible");
    (details.element as HTMLDetailsElement).open = false;
    await details.trigger("toggle");
    expect(details.get("summary").text()).toContain("Alex Smith");
    wrapper.unmount();
  });
  it.each([
    ["generic", "Description / background", "Follow-up date"],
    ["person", "Description", "Follow-up date"],
    ["new_membership", "Description (optional)", "Godparent(s)"],
    ["recurring", "Description / note template", "First due date"],
  ])("places %s description before its section and companion setting", (type, description, companion) => {
    const wrapper = mountDialog(type);
    const labels = wrapper.findAll("label").map((label) => label.find("span").text());
    const section = labels.indexOf("Default section");
    expect(section).toBeGreaterThan(labels.findIndex((label) => label.startsWith(description)));
    expect(labels[section + 1]).toBe(companion);
    if (type === "new_membership") expect(labels).not.toContain("Follow-up date");
    if (type === "recurring") {
      expect(wrapper.get("details").text()).toContain("Default position");
    }
    wrapper.unmount();
  });

  it("reveals a collapsed invalid field and preserves its value when collapsed again", async () => {
    const wrapper = mountDialog("recurring");
    const details = wrapper.get("details");
    const position = details.get('input[aria-label="Default position"]');
    await position.trigger("invalid");
    expect((details.element as HTMLDetailsElement).open).toBe(true);
    expect((position.element as HTMLInputElement).value).toBe("3");
    (details.element as HTMLDetailsElement).open = false;
    await details.trigger("toggle");
    expect(details.get("summary").text()).toContain("Position: 3");
    wrapper.unmount();
  });

  it("keeps one type selected and retains the name and formatted description on switching", async () => {
    const wrapper = mountDialog();
    const person = wrapper.findAll("button").find((button) => button.text() === "Person")!;
    await person.trigger("click");
    await person.trigger("click");
    expect(wrapper.findAll('button[aria-pressed="true"]')).toHaveLength(1);
    expect(wrapper.get('input[required]').element).toHaveProperty("value", "A long topic name");
    const save = vi.spyOn(api, "updateTopic").mockResolvedValue({} as any);
    await wrapper.get("form").trigger("submit");
    expect(save).toHaveBeenCalledWith("topic", expect.objectContaining({
      type: "person", name: "A long topic name", description: "<p>Background</p>",
      responsibleUserId: "user",
    }));
    wrapper.unmount();
    save.mockRestore();
  });

  it("shows localized collapsed summaries in German", () => {
    setLanguage("de");
    const wrapper = mountDialog("recurring");
    expect(wrapper.get("summary").text()).toContain("Weitere Optionen");
    expect(wrapper.get("summary").text()).toContain("Verantwortlich: Alex Smith");
    expect(wrapper.get("summary").text()).toContain("Position: 3");
    wrapper.unmount();
  });

});
