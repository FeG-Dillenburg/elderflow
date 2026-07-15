import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/domain";
import AgendaSectionsView from "./AgendaSectionsView.vue";
const stubs = {
  Button: true,
  Checkbox: true,
  InputNumber: true,
  InputText: true,
  Message: true,
};
describe("AgendaSectionsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, "sections").mockResolvedValue([
      { id: "section", name: "Main", position: 1, isDefault: true },
    ]);
  });
  const view = async () => {
    const wrapper = mount(AgendaSectionsView, {
      shallow: true,
      global: { stubs },
    });
    await flushPromises();
    return wrapper;
  };
  it("loads sections, saves payloads, creates reset drafts, and deletes", async () => {
    const wrapper = await view();
    const vm: any = wrapper.vm;
    let created: unknown;
    vi.spyOn(api, "updateSection").mockResolvedValue({} as any);
    vi.spyOn(api, "createSection").mockImplementation(async (input) => {
      created = { ...input };
      return {} as any;
    });
    vi.spyOn(api, "deleteSection").mockResolvedValue(undefined);
    await vm.save(vm.sections[0]);
    expect(api.updateSection).toHaveBeenCalledWith("section", {
      name: "Main",
      position: 1,
      isDefault: true,
    });
    vm.draft.name = "New";
    await vm.create();
    expect(created).toEqual({ name: "New", position: 1, isDefault: true });
    expect(vm.draft.name).toBe("");
    await vm.remove("section");
    expect(api.deleteSection).toHaveBeenCalledWith("section");
  });
  it("records load/save/delete errors and restores saving", async () => {
    vi.spyOn(api, "sections").mockRejectedValueOnce(new Error("Load failed"));
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.error).toBe("Load failed");
    vi.spyOn(api, "updateSection").mockRejectedValueOnce(
      new Error("Save failed"),
    );
    await vm.save({
      id: "section",
      name: "Main",
      position: 1,
      isDefault: true,
    });
    expect(vm.saving).toBe(false);
    expect(vm.error).toBe("Save failed");
    vi.spyOn(api, "deleteSection").mockRejectedValueOnce(new Error());
    await vm.remove("section");
    expect(vm.error).toBe("This section may still be in use");
  });
  it("uses fallback messages for non-Error failures", async () => {
    vi.spyOn(api, "sections").mockRejectedValueOnce("bad");
    const wrapper = await view();
    const vm: any = wrapper.vm;
    expect(vm.error).toBe("Unable to load sections");
    vi.spyOn(api, "updateSection").mockRejectedValueOnce("bad");
    await vm.save({
      id: "section",
      name: "Main",
      position: 1,
      isDefault: true,
    });
    expect(vm.error).toBe("Unable to save section");
    vi.spyOn(api, "deleteSection").mockRejectedValueOnce("bad");
    await vm.remove("section");
    expect(vm.error).toBe("This section may still be in use");
  });
});
