import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import { protectedText } from "../../e2ee/protected-text";
import { createMeetingWorkspace } from "./core";
import { meetingRouteFactoryKey, useMeetingRoute } from "./vue";
import MeetingWorkspaceStatus from "./MeetingWorkspaceStatus.vue";

const stubs = {
  Dialog: { props: ["visible"], template: '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>' },
  Button: { props: ["label"], template: '<button @click="$emit(\'click\')">{{ label }}</button>' },
  Message: { template: '<p><slot /></p>' },
  Teleport: true,
};
afterEach(() => vi.useRealTimers());

describe("Meeting route navigation and explicit lock", () => {
  it.each(["navigation", "lock"])("offers stay and confirmed discard for %s", async (action) => {
    vi.useFakeTimers();
    const connection = { phase: "temporarily_offline" as const, pending: true, collaborators: [], close: vi.fn(), complete: async () => undefined };
    const workspace = createMeetingWorkspace("navigation-test", {
      load: async () => ({ meeting: { id: "navigation-test", status: "planned" } as Meeting, unlocked: true }),
      connect: async () => connection,
      complete: vi.fn(),
    });
    const Page = defineComponent({
      setup() {
        useMeetingRoute("navigation-test");
        return () => h(MeetingWorkspaceStatus);
      },
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: "/meeting", component: Page },
      { path: "/away", component: { template: "<p>Away</p>" } },
    ] });
    await router.push("/meeting");
    await router.isReady();
    const wrapper = mount(RouterView, { global: {
      plugins: [router], stubs,
      provide: { [meetingRouteFactoryKey as symbol]: () => ({ workspace, opened: workspace.open(), operations: {} }) },
    } });
    await flushPromises();
    const request = () => action === "navigation" ? router.push("/away") : protectedText.lock("explicit", false);
    const first = request();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await wrapper.findAll("button").find((button) => button.text() === "Stay and retry")!.trigger("click");
    await first;
    expect(router.currentRoute.value.path).toBe("/meeting");
    expect(workspace.state.pendingChanges).toBe(true);
    const second = request();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Discard changes and continue")!.trigger("click");
    await second;
    expect(workspace.state.phase).toBe("closed");
    expect(connection.close).toHaveBeenCalledOnce();
    if (action === "navigation") expect(router.currentRoute.value.path).toBe("/away");
    wrapper.unmount();
  });
});
