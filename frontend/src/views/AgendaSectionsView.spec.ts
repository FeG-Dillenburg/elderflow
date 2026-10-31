import { flushPromises, mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import Select from "primevue/select";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import AgendaSectionsView from "./AgendaSectionsView.vue";

const sections = [
  { id: "a", name: "People", position: 1, defaultTopicType: "person" },
  { id: "b", name: "Discussion", position: 2, defaultTopicType: null },
] as any;
const view = async () => {
  const wrapper = mount(AgendaSectionsView, {
    global: {
      plugins: [PrimeVue],
      stubs: { Dialog: { props: ["visible"], template: '<div v-if="visible"><slot /></div>' } },
    },
  });
  await flushPromises();
  return wrapper;
};

describe("Agenda section configuration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "sections").mockResolvedValue(structuredClone(sections));
    vi.spyOn(auth, "canManage").mockReturnValue(true);
    vi.spyOn(api, "createSection").mockResolvedValue({} as any);
    vi.spyOn(api, "updateSection").mockResolvedValue({} as any);
    vi.spyOn(api, "deleteSection").mockResolvedValue(undefined);
    vi.spyOn(api, "reorderSections").mockResolvedValue([...sections].reverse());
  });
  it("shows readable rows and edits a detached draft with occupied types disabled", async () => {
    const wrapper = await view();
    expect(wrapper.findAll("article input")).toHaveLength(0);
    expect(wrapper.findAll("article")[0]!.text()).toContain("Person");
    await wrapper.get('button[aria-label="Edit People"]').trigger("click");
    const select = wrapper.getComponent(Select);
    expect(select.props("options")).toContainEqual(expect.objectContaining({ value: "person", disabled: false }));
    await wrapper.get('input[name="section-name"]').setValue("Changed");
    await wrapper.get('button[aria-label="Cancel"]').trigger("click");
    expect(api.updateSection).not.toHaveBeenCalled();
    expect(wrapper.findAll("article")[0]!.text()).toContain("People");
    await wrapper.get('button[aria-label="Edit Discussion"]').trigger("click");
    expect(wrapper.getComponent(Select).props("options")).toContainEqual(expect.objectContaining({ value: "person", disabled: true }));
    wrapper.unmount();
  });
  it("persists pointer drag ordering using the shared preparation interaction", async () => {
    const wrapper = await view();
    const zone = wrapper.get("[data-agenda-section]");
    vi.spyOn(zone.element, "getBoundingClientRect").mockReturnValue({ left: 0, right: 300, top: 0, bottom: 200 } as DOMRect);
    wrapper.findAll("article").forEach((row, index) => {
      vi.spyOn(row.element, "getBoundingClientRect").mockReturnValue({ top: index * 60, height: 60 } as DOMRect);
    });
    const pointer = (type: string, x: number, y: number, target: EventTarget = document) =>
      target.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));
    pointer("pointerdown", 10, 20, wrapper.get(".drag-handle").element);
    pointer("pointermove", 30, 40);
    await wrapper.vm.$nextTick();
    pointer("pointermove", 40, 160);
    await wrapper.vm.$nextTick();
    pointer("pointerup", 40, 160);
    await flushPromises();
    expect(api.reorderSections).toHaveBeenCalledWith(["b", "a"]);
    wrapper.unmount();
  });
  it("creates through the dialog and persists only validated form values", async () => {
    const wrapper = await view();
    await wrapper.get('button[aria-label="Add section"]').trigger("click");
    await wrapper.get('input[name="section-name"]').setValue("New section");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(api.createSection).toHaveBeenCalledWith({ name: "New section", defaultTopicType: null });
    wrapper.unmount();
  });
  it("offers keyboard ordering and restores server order on failure", async () => {
    vi.spyOn(api, "reorderSections").mockRejectedValue(new Error("Order changed"));
    const wrapper = await view();
    await wrapper.get('button[aria-label="Move People down"]').trigger("click");
    await flushPromises();
    expect(api.reorderSections).toHaveBeenCalledWith(["b", "a"]);
    expect(wrapper.findAll("article").map((row) => row.text())).toEqual([expect.stringContaining("People"), expect.stringContaining("Discussion")]);
    expect(wrapper.text()).toContain("Order changed");
    wrapper.unmount();
  });
  it("refreshes choices on save conflicts and keeps the draft available", async () => {
    vi.spyOn(api, "updateSection").mockRejectedValue(new Error("Type already assigned"));
    const wrapper = await view();
    await wrapper.get('button[aria-label="Edit Discussion"]').trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Type already assigned");
    expect(wrapper.find("form").exists()).toBe(true);
    expect(api.sections).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it("keeps reference data readable without management actions", async () => {
    auth.state.user = { id: "guest" } as any;
    vi.spyOn(auth, "canManage").mockReturnValue(false);
    const wrapper = await view();
    expect(wrapper.findAll("article")).toHaveLength(2);
    expect(wrapper.findAll("button")).toHaveLength(0);
    wrapper.unmount();
    auth.state.user = null;
  });
});
