import { mount } from "@vue/test-utils";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth/auth";
import MeetingCollaborationPresence from "./MeetingCollaborationPresence.vue";
import { meetingCollaboration } from "./meeting-collaboration";

describe("MeetingCollaborationPresence", () => {
  afterEach(() => {
    auth.completeInitialization(null);
    vi.restoreAllMocks();
  });

  it("shows the signed-in user in the meeting-level presence list", async () => {
    const document = new Y.Doc();
    const awareness = new Awareness(document);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: "meeting",
      document,
      awareness,
    } as any);
    auth.completeInitialization({
      id: "daniel",
      firstName: "Daniel",
      lastName: "Haas",
    } as any);

    const wrapper = mount(MeetingCollaborationPresence, {
      props: { meetingId: "meeting" },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="list"] [role="listitem"]').attributes("aria-label"))
      .toBe("Daniel Haas is collaborating live");

    wrapper.unmount();
    awareness.destroy();
    document.destroy();
  });
});
