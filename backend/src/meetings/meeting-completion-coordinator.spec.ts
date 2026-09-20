import { MeetingCompactionCoordinator } from "./meeting-compaction-coordinator";

describe("Meeting completion barrier", () => {
  let coordinator: MeetingCompactionCoordinator;
  const sequence = async () => "7";
  beforeEach(() => { coordinator = new MeetingCompactionCoordinator(); });
  afterEach(() => {
    coordinator.abort("document");
    jest.useRealTimers();
  });

  it("requires every connected workspace to drain and observe the same stable sequence", async () => {
    coordinator.join("document", "a");
    coordinator.join("document", "b");
    const completion = coordinator.beginCompletion("meeting", "document", "user", sequence);
    const id = coordinator.current("document")!.barrierId;
    await coordinator.completionDrained("document", id, "a");
    expect(coordinator.prepareUpdate("document", "b")).toBe(true);
    await coordinator.completionDrained("document", id, "b");
    coordinator.confirmCompletion("document", id, "a", "7");
    expect(coordinator.current("document")).toBeTruthy();
    coordinator.confirmCompletion("document", id, "b", "6");
    coordinator.confirmCompletion("document", id, "b", "7");
    await expect(completion).resolves.toEqual({ barrierId: id, serverSequence: "7" });
    expect(coordinator.prepareUpdate("document", "a")).toBe(false);
    expect(coordinator.beginExternalUpdate("meeting")).toBe(false);
    coordinator.complete("meeting", id);
  });
  it("adds a joining workspace and aborts on disconnect without losing retryability", async () => {
    coordinator.join("document", "a");
    const result = coordinator.beginCompletion("meeting", "document", "user", sequence);
    const rejected = expect(result).rejects.toMatchObject({ response: { code: "MEETING_COMPLETION_RETRY" } });
    const id = coordinator.current("document")!.barrierId;
    await coordinator.completionDrained("document", id, "a");
    coordinator.join("document", "b");
    coordinator.confirmCompletion("document", id, "a", "7");
    coordinator.disconnected("document", "b");
    await rejected;
    expect(coordinator.prepareUpdate("document", "a")).toBe(true);
    coordinator.disconnected("document", "a");
    const retry = await coordinator.beginCompletion("meeting", "document", "user", sequence);
    coordinator.complete("meeting", retry.barrierId);
  });

  it("times out after five seconds even when only some participants confirmed", async () => {
    jest.useFakeTimers();
    coordinator.join("document", "a");
    const result = coordinator.beginCompletion("meeting", "document", "user", sequence);
    const rejected = expect(result).rejects.toMatchObject({ response: { code: "MEETING_COMPLETION_RETRY" } });
    await coordinator.completionDrained("document", coordinator.current("document")!.barrierId, "a");
    await jest.advanceTimersByTimeAsync(5_000);
    await rejected;
    expect(coordinator.current("document")).toBeNull();
  });

  it("rejects a conflicting compaction and external writers before or during draining", async () => {
    coordinator.beginExternalUpdate("meeting");
    await expect(coordinator.beginCompletion("meeting", "document", "user", sequence)).rejects.toThrow();
    coordinator.endExternalUpdate("meeting");
    coordinator.open({ meetingId: "meeting", documentId: "document", compactorConnectionId: "a",
      compactorUserId: "user", participantIds: ["a"] });
    await expect(coordinator.beginCompletion("meeting", "document", "user", sequence)).rejects.toThrow();
    coordinator.abort("document");
    coordinator.join("document", "a");
    const result = coordinator.beginCompletion("meeting", "document", "user", sequence);
    const rejected = expect(result).rejects.toThrow();
    expect(coordinator.beginExternalUpdate("meeting")).toBe(true);
    await rejected;
    coordinator.endExternalUpdate("meeting");
  });

  it("cannot capture a stable sequence while an accepted collaboration write is running", async () => {
    coordinator.join("document", "a");
    coordinator.beginCollaborationUpdate("meeting");
    const result = coordinator.beginCompletion("meeting", "document", "user", sequence);
    const rejected = expect(result).rejects.toThrow();
    await coordinator.completionDrained("document", coordinator.current("document")!.barrierId, "a");
    await rejected;
    coordinator.endCollaborationUpdate("meeting");
  });

});
