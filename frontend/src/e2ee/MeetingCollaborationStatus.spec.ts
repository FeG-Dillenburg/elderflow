import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MeetingCollaborationStatus from "./MeetingCollaborationStatus.vue";
import { meetingCollaboration } from "./meeting-collaboration";

describe("MeetingCollaborationStatus", () => {
  afterEach(() => vi.restoreAllMocks());

  it("connects when collaboration starts after the status bar is mounted", async () => {
    const provider = Object.assign(new EventTarget(), { status: "online" });
    const getProvider = vi.spyOn(meetingCollaboration, "get")
      .mockReturnValueOnce(undefined)
      .mockReturnValue(provider as never);
    const wrapper = mount(MeetingCollaborationStatus, { props: { meetingId: "meeting" } });

    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    window.dispatchEvent(new CustomEvent("elderflow:meeting-collaboration-started", {
      detail: "meeting",
    }));
    await wrapper.vm.$nextTick();

    expect(getProvider).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toBe("Live collaboration connected");
  });
});
