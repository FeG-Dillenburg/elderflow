import { describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import {
  createMeetingWorkspace,
  type MeetingWorkspaceBackend,
  type MeetingWorkspaceCollaboration,
} from "./index";

const meeting = (overrides: Partial<Meeting> = {}): Meeting => ({
  id: "meeting-1",
  title: "Council",
  date: "2026-09-19",
  beginTime: "19:30",
  status: "planned",
  meetingLeaderId: null,
  minuteTakerId: null,
  generalNotes: "General",
  openingInput: "Opening",
  participants: [],
  agenda: [
    {
      id: "generic-appearance",
      meetingId: "meeting-1",
      topicId: "generic-topic",
      sectionId: "section-1",
      position: 1,
      plannedDuration: null,
      status: "planned",
      topic: { id: "generic-topic", type: "generic" } as never,
      preparationContext: { id: "generic-appearance", text: "Prepare", version: 0 },
      meetingMinutes: { id: "generic-appearance", text: "Minutes", version: 0 },
    },
    {
      id: "person-appearance",
      meetingId: "meeting-1",
      topicId: "person-topic",
      sectionId: "section-1",
      position: 2,
      plannedDuration: null,
      status: "planned",
      topic: { id: "person-topic", type: "person" } as never,
      personNote: { id: "person-appearance", text: "Person note", version: 0 },
    },
  ],
  ...overrides,
});

const setup = (result: Meeting = meeting(), unlocked = true) => {
  const collaboration: MeetingWorkspaceCollaboration = {
    phase: "ready",
    pending: false,
    collaborators: [],
    close: vi.fn(),
    complete: vi.fn().mockResolvedValue(undefined),
  };
  const backend: MeetingWorkspaceBackend = {
    load: vi.fn().mockResolvedValue({ meeting: result, unlocked }),
    connect: vi.fn().mockResolvedValue(collaboration),
    complete: vi.fn().mockResolvedValue(meeting({ status: "completed" })),
    updateText: vi.fn().mockResolvedValue(undefined),
  };
  return { backend, collaboration };
};

describe("Meeting workspace contract", () => {
  it("atomically publishes an unlocked Meeting and maps every valid domain text target", async () => {
    const { backend } = setup();
    const workspace = createMeetingWorkspace("meeting-1", backend);

    expect(workspace.state.phase).toBe("opening");
    expect(workspace.state.meeting).toBeNull();

    await workspace.open();

    expect(workspace.state.phase).toBe("ready");
    expect(workspace.text({ kind: "general_notes" }).value).toBe("General");
    expect(workspace.text({ kind: "opening_input" }).value).toBe("Opening");
    expect(workspace.text({ kind: "preparation_context", appearanceId: "generic-appearance" }).value)
      .toBe("Prepare");
    expect(workspace.text({ kind: "meeting_minutes_text", appearanceId: "generic-appearance" }).value)
      .toBe("Minutes");
    expect(workspace.text({ kind: "meeting_topic_note", appearanceId: "person-appearance" }).value)
      .toBe("Person note");
    expect(Object.isFrozen(workspace.state.meeting)).toBe(true);
    expect(Object.isFrozen(workspace.state.meeting?.agenda)).toBe(true);
  });

  it("publishes locked placeholders without opening collaboration", async () => {
    const { backend } = setup(meeting({ generalNotes: "Locked" }), false);
    const workspace = createMeetingWorkspace("meeting-1", backend);

    await workspace.open();

    expect(workspace.state.phase).toBe("locked");
    expect(workspace.state.meeting?.generalNotes).toBe("Locked");
    expect(workspace.text({ kind: "general_notes" }).editable).toBe(false);
    expect(backend.connect).not.toHaveBeenCalled();
  });

  it("loads a Completed Meeting as immutable without collaboration", async () => {
    const { backend } = setup(meeting({ status: "completed" }));
    const workspace = createMeetingWorkspace("meeting-1", backend);

    await workspace.open();

    expect(workspace.state.phase).toBe("ready");
    expect(workspace.text({ kind: "general_notes" }).editable).toBe(false);
    expect(backend.connect).not.toHaveBeenCalled();
  });

  it("rejects incompatible or foreign text targets", async () => {
    const { backend } = setup();
    const workspace = createMeetingWorkspace("meeting-1", backend);
    await workspace.open();

    expect(() => workspace.text({
      kind: "meeting_topic_note",
      appearanceId: "generic-appearance",
    })).toThrow("MEETING_TEXT_TARGET_INVALID");
    expect(() => workspace.text({
      kind: "preparation_context",
      appearanceId: "person-appearance",
    })).toThrow("MEETING_TEXT_TARGET_INVALID");
    expect(() => workspace.text({
      kind: "meeting_minutes_text",
      appearanceId: "foreign-appearance",
    })).toThrow("MEETING_TEXT_TARGET_INVALID");
  });

  it("does not publish an editable fallback when canonical loading fails", async () => {
    const { backend } = setup();
    vi.mocked(backend.load).mockRejectedValue(new Error("integrity failure"));
    const workspace = createMeetingWorkspace("meeting-1", backend);

    await expect(workspace.open()).rejects.toThrow("integrity failure");

    expect(workspace.state.phase).toBe("unavailable");
    expect(workspace.state.meeting).toBeNull();
  });

  it("publishes remote edits, collaborator presence, and temporary offline state", async () => {
    let loaded = meeting();
    let notify: ((change?: "state" | "document") => void) | undefined;
    const collaboration = {
      phase: "ready" as MeetingWorkspaceCollaboration["phase"],
      pending: false,
      collaborators: [] as MeetingWorkspaceCollaboration["collaborators"],
      subscribe: vi.fn((listener: typeof notify) => {
        notify = listener;
        return () => undefined;
      }),
      close: vi.fn(),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    const backend: MeetingWorkspaceBackend = {
      load: vi.fn(async () => ({ meeting: loaded, unlocked: true })),
      connect: vi.fn(async () => collaboration),
      complete: vi.fn(),
    };
    const workspace = createMeetingWorkspace("meeting-1", backend);
    await workspace.open();

    collaboration.collaborators = [{
      id: "user-2",
      name: "Daria Muster",
      initials: "DM",
      color: "#123456",
    }];
    collaboration.phase = "temporarily_offline";
    collaboration.pending = true;
    notify?.("state");

    expect(workspace.state.phase).toBe("temporarily_offline");
    expect(workspace.state.pendingChanges).toBe(true);
    expect(workspace.state.collaborators[0]?.name).toBe("Daria Muster");

    loaded = meeting({ generalNotes: "Remote edit" });
    notify?.("document");
    await vi.waitFor(() => {
      expect(workspace.text({ kind: "general_notes" }).value).toBe("Remote edit");
    });
  });

  it("closes the previous live workspace before opening another one", async () => {
    const firstSetup = setup();
    const secondSetup = setup(meeting({ id: "meeting-2" }));
    const first = createMeetingWorkspace("meeting-1", firstSetup.backend);
    const second = createMeetingWorkspace("meeting-2", secondSetup.backend);
    await first.open();

    await second.open();

    expect(firstSetup.collaboration.close).toHaveBeenCalledOnce();
    expect(first.state.phase).toBe("closed");
    expect(second.state.phase).toBe("ready");
  });
});
