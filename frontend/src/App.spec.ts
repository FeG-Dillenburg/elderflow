import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { api } from "./api/domain";
import App from "./App.vue";
const stubs = {
  RouterLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
  RouterView: true,
};
describe("App", () => {
  it("renders the current user and every navigation destination", async () => {
    vi.spyOn(api, "me").mockResolvedValue({
      id: "user",
      firstName: "Ada",
      lastName: "Lovelace",
      role: "admin",
    } as any);
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("Ada Lovelace");
    for (const path of [
      "/",
      "/meetings",
      "/topics",
      "/tasks",
      "/users",
      "/agenda-sections",
    ])
      expect(wrapper.html()).toContain(`href="${path}"`);
  });
  it("keeps identity hidden when lookup fails", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new Error("No identity"));
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find(".current-user").exists()).toBe(false);
  });
});
