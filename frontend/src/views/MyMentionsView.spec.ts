import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { protectedText } from "../e2ee/protected-text";
import MyMentionsView from "./MyMentionsView.vue";

afterEach(() => vi.restoreAllMocks());
it("offers unlock without loading or exposing plaintext while locked", async () => {
  protectedText.state.status = "locked";
  const fetch = vi.spyOn(globalThis, "fetch");
  const wrapper = mount(MyMentionsView);
  await flushPromises();
  expect(wrapper.text()).toContain("Unlock Protected text");
  expect(wrapper.find("table").exists()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  wrapper.unmount();
});
