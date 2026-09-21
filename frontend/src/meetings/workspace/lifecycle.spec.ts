import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../../api/domain";
import { createMeetingWorkspace, type MeetingWorkspace, type MeetingWorkspaceCollaboration } from "./core";

const owned: MeetingWorkspace[] = [];
let nextId = 0;
const setup = () => {
  const id = `lifecycle-${++nextId}`;
  let meeting = { id, status: "planned", generalNotes: "Trusted", agenda: [
    { id: "appearance", meetingId: id, topic: { type: "person" }, personNote: { text: "Note" } },
  ] } as Meeting;
  let notify: (change?: "state" | "document") => void = () => undefined;
  const connection = {
    phase: "ready" as MeetingWorkspaceCollaboration["phase"],
    pending: false,
    failure: undefined as MeetingWorkspaceCollaboration["failure"],
    collaborators: [],
    subscribe(listener: typeof notify) { notify = listener; return () => { notify = () => undefined; }; },
    close: vi.fn(),
    complete: async () => undefined,
  };
  const backend = {
    load: vi.fn(async () => ({ meeting, unlocked: true })),
    connect: async () => connection,
    complete: async () => ({ ...meeting, status: "completed" }),
    dispose: vi.fn(),
    revokeAccess: vi.fn(),
    updateText: vi.fn(async (): Promise<void> => undefined),
  };
  const workspace = createMeetingWorkspace(id, backend);
  owned.push(workspace);
  return { workspace, backend, connection,
    notify: () => notify("state"),
    replace: (next: Meeting) => { meeting = next; },
  };
};
afterEach(() => {
  for (const workspace of owned.splice(0)) workspace.forceClose("test-cleanup");
  vi.useRealTimers();
});

describe("Meeting workspace lifecycle", () => {
  it.each([false, true])("keeps Protected text unlocked after remote completion (discarded changes: %s)", async (discarded) => {
    const { workspace, backend, connection, notify, replace } = setup();
    await workspace.open();
    replace({ ...workspace.state.meeting, status: "completed", generalNotes: "Saved text" } as Meeting);
    Object.assign(connection, { failure: "completed", discardedChanges: discarded, pending: false });
    notify();
    await vi.waitFor(() => expect(workspace.state.meeting?.status).toBe("completed"));
    expect(backend.revokeAccess).not.toHaveBeenCalled();
    expect(workspace.state.phase).toBe("ready");
    expect(workspace.state.notice).toBe(discarded ? "completed_changes_discarded" : "completed_elsewhere");
    expect(workspace.text({ kind: "general_notes" }).value).toBe("Saved text");
    expect(workspace.text({ kind: "general_notes" }).editable).toBe(false);
    expect(backend.dispose).toHaveBeenCalledOnce();
  });

  it("does not mistake an acknowledged edit's pending refresh for lost content", async () => {
    const { workspace, backend, connection, notify, replace } = setup();
    await workspace.open();
    const saved = { ...workspace.state.meeting, generalNotes: "Saved text" } as Meeting;
    let releaseRefresh!: () => void;
    backend.load.mockImplementationOnce(() => new Promise((resolve) => {
      releaseRefresh = () => resolve({ meeting: saved, unlocked: true });
    }));
    const write = workspace.updateText({ kind: "general_notes" }, "Saved text");
    await vi.waitFor(() => expect(backend.load).toHaveBeenCalledTimes(2));
    replace({ ...saved, status: "completed" });
    Object.assign(connection, { failure: "completed", discardedChanges: false, pending: false });
    notify();
    await vi.waitFor(() => expect(workspace.state.meeting?.status).toBe("completed"));
    expect(workspace.state.notice).toBe("completed_elsewhere");
    releaseRefresh();
    await write;
    expect(workspace.text({ kind: "general_notes" }).value).toBe("Saved text");
    expect(backend.revokeAccess).not.toHaveBeenCalled();
  });

  it("does not invent a security warning when a clean route remounts during unlock", async () => {
    const { workspace, backend } = setup();
    await workspace.open();
    workspace.forceClose("unmount");
    const reopened = createMeetingWorkspace(workspace.meetingId, backend);
    owned.push(reopened);
    await reopened.open();
    expect(reopened.state.notice).toBeUndefined();
  });

  it("acknowledges a notice without changing content and does not repeat it on return", async () => {
    const { workspace, backend, connection } = setup();
    await workspace.open();
    connection.pending = true;
    workspace.forceClose("logout");
    connection.pending = false;
    const reopened = createMeetingWorkspace(workspace.meetingId, backend);
    owned.push(reopened);
    await reopened.open();
    expect(reopened.state.notice).toBe("forced_close");
    reopened.dismissNotice();
    expect(reopened.state.notice).toBeUndefined();
    expect(reopened.text({ kind: "general_notes" }).value).toBe("Trusted");
    await reopened.close();
    await reopened.open();
    expect(reopened.state.notice).toBeUndefined();
  });

  it("does not claim changes were discarded after a clean security closure", async () => {
    const { workspace } = setup();
    await workspace.open();
    workspace.forceClose("logout");
    expect(workspace.state.notice).toBe("security_closed");
  });

  it("closes acknowledged changes without waiting or prompting", async () => {
    const { workspace, backend } = setup();
    await workspace.open();
    expect(await workspace.close()).toBe(true);
    expect(workspace.state.phase).toBe("closed");
    expect(backend.dispose).toHaveBeenCalledOnce();
  });

  it("waits for local encryption and transmission before closing", async () => {
    vi.useFakeTimers();
    const { workspace, backend } = setup();
    let finish!: () => void;
    backend.updateText.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await workspace.open();
    const write = workspace.updateText({ kind: "general_notes" }, "Pending");
    const closing = workspace.close();
    expect(workspace.state.pendingChanges).toBe(true);
    expect(workspace.state.closing).toBe(true);
    finish();
    await write;
    await vi.advanceTimersByTimeAsync(25);
    expect(await closing).toBe(true);
  });

  it("keeps pending changes after cancelled discard, then permits explicit discard", async () => {
    vi.useFakeTimers();
    const { workspace, connection, notify } = setup();
    await workspace.open();
    connection.pending = true;
    connection.phase = "temporarily_offline";
    notify();
    const closing = workspace.close({ reason: "lock" });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await closing).toBe(false);
    workspace.cancelClose();
    expect(workspace.text({ kind: "general_notes" }).editable).toBe(true);
    expect(workspace.state.pendingChanges).toBe(true);
    expect(await workspace.close({ discard: true })).toBe(true);
    expect(workspace.state.meeting).toBeNull();
  });

  it("protects browser unload only while changes are pending", async () => {
    const { workspace, connection, notify } = setup();
    await workspace.open();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    connection.pending = true;
    notify();
    expect(unload()).toBe(true);
    connection.pending = false;
    notify();
    expect(unload()).toBe(false);
  });

  it.each(["logout", "inactivity", "authorization-loss", "identity-change", "remote", "epoch-revocation"])(
    "immediately closes and forgets content on %s, retaining only a notice on return", async (reason) => {
      const { workspace, connection, backend, notify } = setup();
      await workspace.open();
      connection.pending = true;
      notify();
      workspace.forceClose(reason);
      expect(workspace.state.phase).toBe("closed");
      expect(workspace.state.meeting).toBeNull();
      expect(workspace.state.pendingChanges).toBe(false);
      expect(backend.dispose).toHaveBeenCalledOnce();
      connection.pending = false;
      const returned = createMeetingWorkspace(workspace.meetingId, backend);
      owned.push(returned);
      await returned.open();
      expect(returned.state.notice).toBe("forced_close");
    },
  );

  it("does not resurrect a workspace after an in-flight load finishes", async () => {
    const { workspace, backend } = setup();
    const loaded = await backend.load();
    let finish!: () => void;
    backend.load.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(loaded); }));
    const opening = workspace.open();
    workspace.forceClose("logout");
    finish();
    await opening;
    expect(workspace.state.phase).toBe("closed");
    expect(workspace.state.meeting).toBeNull();
  });

  it("preserves trusted content during recoverable failure and disables editing on integrity failure", async () => {
    const { workspace, backend } = setup();
    await workspace.open();
    backend.load.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(workspace.refresh()).rejects.toThrow();
    expect(workspace.state.phase).toBe("temporarily_offline");
    expect(workspace.text({ kind: "general_notes" }).editable).toBe(true);
    backend.load.mockRejectedValueOnce(new Error("E2EE_SIGNATURE_INVALID"));
    await expect(workspace.refresh()).rejects.toThrow();
    expect(workspace.state.phase).toBe("unavailable");
    expect(workspace.state.meeting).toBeNull();
    await workspace.open();
    expect(workspace.state.phase).toBe("ready");
  });

  it("can close cleanly after a write fails integrity validation and a trusted reload succeeds", async () => {
    vi.useFakeTimers();
    const { workspace, backend } = setup();
    await workspace.open();
    backend.load.mockRejectedValueOnce(new Error("E2EE_SIGNATURE_INVALID"));
    await expect(workspace.updateText({ kind: "general_notes" }, "Edit")).rejects.toThrow();
    await workspace.open();
    expect(workspace.state.pendingChanges).toBe(false);
    expect(await workspace.close()).toBe(true);
  });

  it.each(["forbidden", "completed"])("distinguishes revoked access from a canonical %s Meeting", async (cause) => {
    const { workspace, backend, replace } = setup();
    await workspace.open();
    if (cause === "forbidden") {
      backend.load.mockRejectedValueOnce(Object.assign(new Error("Denied"), { status: 403 }));
      await expect(workspace.refresh()).rejects.toThrow();
    } else {
      replace({ ...workspace.state.meeting, status: "completed" } as Meeting);
      await workspace.refresh();
    }
    if (cause === "forbidden") {
      expect(workspace.state.phase).toBe("closed");
      expect(workspace.state.meeting).toBeNull();
      expect(backend.revokeAccess).toHaveBeenCalledOnce();
    } else {
      expect(workspace.state.phase).toBe("ready");
      expect(workspace.state.meeting?.status).toBe("completed");
      expect(backend.revokeAccess).not.toHaveBeenCalled();
    }
  });

  it("invalidates a retained binding when its appearance is removed", async () => {
    const { workspace, replace } = setup();
    await workspace.open();
    const binding = workspace.text({ kind: "meeting_topic_note", appearanceId: "appearance" });
    replace({ ...workspace.state.meeting, agenda: [] } as Meeting);
    await workspace.refresh();
    expect(binding.editable).toBe(false);
    await expect(workspace.updateText(binding.target, "Must not be written")).rejects.toThrow();
  });

  it("does not reopen a replacement force-closed while its predecessor is closing", async () => {
    const first = setup();
    const second = setup();
    await first.workspace.open();
    const opening = second.workspace.open();
    second.workspace.forceClose("logout");
    await opening;
    expect(second.workspace.state.phase).toBe("closed");
    expect(second.backend.load).not.toHaveBeenCalled();
  });

  it("blocks replacement until the pending workspace can close", async () => {
    vi.useFakeTimers();
    const first = setup();
    const second = setup();
    await first.workspace.open();
    first.connection.pending = true;
    const opening = expect(second.workspace.open()).rejects.toThrow("MEETING_WORKSPACE_PENDING_CHANGES");
    await vi.advanceTimersByTimeAsync(1_500);
    await opening;
    expect(second.backend.load).not.toHaveBeenCalled();
    first.connection.pending = false;
    await second.workspace.open();
    expect(first.workspace.state.phase).toBe("closed");
    expect(second.workspace.state.phase).toBe("ready");
  });
});
