import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrimeVue from "primevue/config";
import { api, type Topic, type TopicHistoryEntry } from "../api/domain";
import { auth } from "../auth/auth";
import { protectedText } from "../e2ee/protected-text";
import TopicPreviewDialog from "./TopicPreviewDialog.vue";

enableAutoUnmount(afterEach);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const topic = (id: string) => ({ id, name: `Topic ${id}`, type: "generic" }) as Topic;
const history = (text: string): TopicHistoryEntry[] => [{
  kind: "standalone_update",
  id: "update",
  updateId: "update",
  effectiveAt: "2026-11-01T12:00:00Z",
  createdByDisplayName: "Daniel",
  text: `<p><strong>${text}</strong></p>`,
}];
const dialogStub = {
  props: ["visible", "header"],
  template: '<section v-if="visible" role="dialog"><h1>{{ header }}</h1><button aria-label="Close" @click="$emit(\'update:visible\', false)" /><slot /></section>',
};
const view = (id: string | null = "one") => mount(TopicPreviewDialog, {
  props: { topicId: id },
  global: { plugins: [PrimeVue], stubs: { Dialog: dialogStub } },
});

beforeEach(() => {
  vi.restoreAllMocks();
  auth.state.user = { id: "reader" } as any;
  protectedText.state.status = "unlocked";
  vi.spyOn(api, "topic").mockImplementation(async (id) => topic(id));
  vi.spyOn(api, "topicHistory").mockResolvedValue(history("Historical text"));
});

afterEach(() => {
  auth.state.user = null;
  protectedText.state.status = "locked";
});

describe("Topic preview", () => {
  it("loads on demand and displays only the title and existing readonly history", async () => {
    const tasks = vi.spyOn(api, "tasks");
    const directory = vi.spyOn(api, "userDirectory");
    const sections = vi.spyOn(api, "sections");
    const wrapper = view(null);
    expect(api.topic).not.toHaveBeenCalled();
    expect(api.topicHistory).not.toHaveBeenCalled();
    await wrapper.setProps({ topicId: "one" });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Topic one");
    expect(wrapper.get(".rich-content strong").text()).toBe("Historical text");
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.find("input, textarea, aside, [contenteditable]").exists()).toBe(false);
    expect(tasks).not.toHaveBeenCalled();
    expect(directory).not.toHaveBeenCalled();
    expect(sections).not.toHaveBeenCalled();
  });

  it("clears the previous selection immediately and ignores responses for older Topics", async () => {
    const firstTopic = deferred<Topic>();
    const firstHistory = deferred<TopicHistoryEntry[]>();
    vi.mocked(api.topic).mockReturnValueOnce(firstTopic.promise);
    vi.mocked(api.topicHistory).mockReturnValueOnce(firstHistory.promise);
    const wrapper = view();
    expect(wrapper.text()).toContain("Loading Topic history");
    await wrapper.setProps({ topicId: "two" });
    await flushPromises();
    firstTopic.resolve(topic("one"));
    firstHistory.resolve(history("Old history"));
    await flushPromises();
    expect(wrapper.text()).toContain("Topic two");
    expect(wrapper.text()).not.toContain("Old history");
    const pending = deferred<TopicHistoryEntry[]>();
    vi.mocked(api.topicHistory).mockReturnValueOnce(pending.promise);
    await wrapper.setProps({ topicId: "three" });
    expect(wrapper.text()).not.toContain("Historical text");
    pending.resolve([]);
    await flushPromises();
    expect(wrapper.text()).toContain("No Topic history has been recorded.");
  });

  it("retries history independently while keeping the loaded title", async () => {
    vi.mocked(api.topicHistory).mockRejectedValueOnce(new Error("Offline"));
    const wrapper = view();
    await flushPromises();
    expect(wrapper.text()).toContain("Topic one");
    expect(wrapper.get('[role="alert"]').text()).toContain("Unable to load Topic history");
    await wrapper.findAll("button").find((button) => button.text() === "Retry loading history")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Historical text");
    expect(api.topic).toHaveBeenCalledTimes(1);
  });

  it("retries the title independently while keeping loaded history", async () => {
    vi.mocked(api.topic).mockRejectedValueOnce(new Error("Offline"));
    const wrapper = view();
    await flushPromises();
    expect(wrapper.text()).toContain("Historical text");
    await wrapper.findAll("button").find((button) => button.text() === "Retry loading Topic")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Topic one");
    expect(api.topicHistory).toHaveBeenCalledTimes(1);
  });

  it.each(["close", "lock", "logout", "identity", "dispose"])(
    "clears confidential data and rejects late responses on %s",
    async (action) => {
      const delayed = deferred<TopicHistoryEntry[]>();
      vi.mocked(api.topicHistory).mockReturnValueOnce(delayed.promise);
      const wrapper = view();
      await flushPromises();
      if (action === "close") await wrapper.get('[aria-label="Close"]').trigger("click");
      if (action === "lock") protectedText.state.status = "locked";
      if (action === "logout") window.dispatchEvent(new Event("elderflow:before-logout"));
      if (action === "identity") auth.state.user = { id: "someone-else" } as any;
      if (action === "dispose") wrapper.unmount();
      delayed.resolve(history("Late secret"));
      await flushPromises();
      if (action !== "dispose") {
        expect(wrapper.emitted("update:topicId")?.at(-1)).toEqual([null]);
        expect(wrapper.text()).not.toContain("Topic one");
        expect(wrapper.text()).not.toContain("Late secret");
      }
    },
  );
});

describe("Topic preview modal", () => {
  it.each(["X", "backdrop", "Escape"])(
    "closes through %s and restores focus without changing the draft",
    async (method) => {
      const wrapper = mount({
        components: { TopicPreviewDialog },
        data: () => ({ selected: null as string | null, draft: "Keep my draft" }),
        template: '<div><input v-model="draft" /><button class="open" @click="selected = \'one\'">Preview</button><TopicPreviewDialog v-model:topic-id="selected" /></div>',
      }, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Transition: false } },
      });
      const trigger = wrapper.get(".open");
      (trigger.element as HTMLButtonElement).focus();
      await trigger.trigger("click");
      await flushPromises();
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      expect(document.body.classList.contains("p-overflow-hidden")).toBe(true);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(dialog.style.height).toBe("90dvh");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
      if (method === "X") close.click();
      if (method === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
      if (method === "backdrop") {
        const mask = document.querySelector(".topic-preview-mask")!;
        mask.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        mask.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      expect(document.activeElement).toBe(trigger.element);
      expect((wrapper.get("input").element as HTMLInputElement).value).toBe("Keep my draft");
      expect(document.body.classList.contains("p-overflow-hidden")).toBe(false);
    },
  );
});
