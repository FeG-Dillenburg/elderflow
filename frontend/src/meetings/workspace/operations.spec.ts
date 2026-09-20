import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type Meeting } from "../../api/domain";
import { createMeetingWorkspace } from "./core";
import { protectedText } from "../../e2ee/protected-text";
import { createMeetingRouteOperations, productionMeetingWorkspaceBackend } from "./production-adapter";

afterEach(() => {
  protectedText.state.status = "locked";
  vi.restoreAllMocks();
});

describe("Meeting structural operations", () => {
  it("never opens editable blank content when the canonical encrypted workspace is missing", async () => {
    protectedText.state.status = "unlocked";
    vi.spyOn(api, "meeting").mockResolvedValue({ id: "missing-canonical", status: "planned" } as Meeting);
    const workspace = createMeetingWorkspace("missing-canonical", productionMeetingWorkspaceBackend);
    await expect(workspace.open()).rejects.toThrow("MEETING_WORKSPACE_UNAVAILABLE");
    expect(workspace.state.phase).toBe("unavailable");
    expect(workspace.state.meeting).toBeNull();
    await workspace.close();
  });

  it("publishes the authoritative Agenda before removal resolves and invalidates its binding", async () => {
    let meeting = { id: "structural", status: "planned", agenda: [
      { id: "appearance", meetingId: "structural", topic: { type: "person" }, personNote: { text: "Note" } },
    ] } as Meeting;
    const workspace = createMeetingWorkspace(meeting.id, {
      load: async () => ({ meeting, unlocked: true, collaborative: false }),
      complete: vi.fn(),
    });
    await workspace.open();
    const binding = workspace.text({ kind: "meeting_topic_note", appearanceId: "appearance" });
    vi.spyOn(api, "removeMeetingTopic").mockImplementation(async () => {
      meeting = { ...meeting, agenda: [] };
    });
    const operations = createMeetingRouteOperations(meeting.id, () => workspace.refresh());
    await operations.removeTopic("appearance");
    expect(workspace.state.meeting?.agenda).toEqual([]);
    expect(binding.editable).toBe(false);
    expect(binding.value).toBe("");
    await workspace.close();
  });

  it("keeps the authoritative read model intact when an operation fails", async () => {
    const meeting = { id: "structural-failure", status: "planned", title: "Original", agenda: [] } as unknown as Meeting;
    const workspace = createMeetingWorkspace(meeting.id, {
      load: async () => ({ meeting, unlocked: true, collaborative: false }),
      complete: vi.fn(),
    });
    await workspace.open();
    vi.spyOn(api, "updateMeeting").mockRejectedValue(new TypeError("Network unavailable"));
    const operations = createMeetingRouteOperations(meeting.id, () => workspace.refresh());
    await expect(operations.updateMeeting({ title: "Unsaved" })).rejects.toThrow();
    expect(workspace.state.meeting?.title).toBe("Original");
    await workspace.close();
  });
});
