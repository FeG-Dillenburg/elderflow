import { afterEach, describe, expect, it, vi } from "vitest";
import { api, formatUser, meetingLabel, request, toLocalDate } from "./domain";

const response = (body: unknown, options: Partial<Response> = {}) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    ...options,
  }) as unknown as Response;

describe("domain API client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses the API base URL, JSON header, and caller headers", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: "one" }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      request("/api/example", { headers: { Authorization: "Bearer token" } }),
    ).resolves.toEqual({ id: "one" });
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/api/example", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
    });
  });
  it("returns undefined for empty successful responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(null, { status: 204 }))
      .mockResolvedValueOnce(
        response(null, { headers: new Headers({ "content-length": "0" }) }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(request("/api/example")).resolves.toBeUndefined();
    await expect(request("/api/example")).resolves.toBeUndefined();
  });
  it("turns string, array, and invalid error responses into useful messages", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: "Nope" }),
    });
    await expect(request("/x")).rejects.toThrow("Nope");
    fetch.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: ["One", "Two"] }),
    });
    await expect(request("/x")).rejects.toThrow("One, Two");
    fetch.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    });
    await expect(request("/x")).rejects.toThrow(
      "The request could not be completed",
    );
  });
  it("builds query strings while omitting empty values and retaining false", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    await api.tasks({ status: "open", overdue: false, dueOn: undefined });
    expect(fetch.mock.calls[0][0]).toBe(
      "http://localhost:3000/api/tasks?status=open&overdue=false",
    );
  });
  it("loads referenced users from the non-administrative directory endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    await api.userDirectory();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/user-directory",
      expect.any(Object),
    );
  });
  it("loads Topic history from the single grouped read-model endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);

    await api.topicHistory("topic");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/topics/topic/history",
      expect.any(Object),
    );
  });
  it("sends representative GET/POST/PUT/DELETE requests and a mutable meeting-topic payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await api.topic("topic");
    await api.createTopic({ name: "Topic" } as any);
    await api.updateMeetingTopic("meeting", {
      id: "item",
      sectionId: "section",
      position: 2,
      agendaNote: null,
      plannedDuration: 10,
      status: "planned",
      ignored: "x",
    } as any, { deferred: true });
    await api.deleteSection("section");
    expect(fetch.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["http://localhost:3000/api/topics/topic", undefined],
      ["http://localhost:3000/api/topics", "POST"],
      ["http://localhost:3000/api/meetings/meeting/topics/item", "PUT"],
      ["http://localhost:3000/api/agenda-sections/section", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
      sectionId: "section",
      position: 2,
      plannedDuration: 10,
      status: "planned",
      deferred: true,
    });
  });
  it("serializes an optional insertion position and complete transactional reorder payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await api.addMeetingTopic("meeting", { topicId: "topic", sectionId: "section", position: 2 });
    await api.reorderMeetingTopics("meeting", [
      { id: "item-1", sectionId: "section", position: 1 },
      { id: "item-2", sectionId: "section", position: 2 },
    ]);
    expect(fetch.mock.calls.map((call) => [call[0], call[1]?.method, JSON.parse(call[1]?.body)])).toEqual([
      ["http://localhost:3000/api/meetings/meeting/topics", "POST", { topicId: "topic", sectionId: "section", position: 2 }],
      ["http://localhost:3000/api/meetings/meeting/topics/order", "PUT", {
        items: [
          { id: "item-1", sectionId: "section", position: 1 },
          { id: "item-2", sectionId: "section", position: 2 },
        ],
      }],
    ]);
  });
  it("uses the explicit completion action without a mutable Meeting payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ status: "completed" }));
    vi.stubGlobal("fetch", fetch);

    await api.completeMeeting("meeting");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/meetings/meeting/complete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
  });
  it("writes versioned preparation context through its semantic endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ agendaNote: "Context", noteVersion: 2 }));
    vi.stubGlobal("fetch", fetch);

    await api.updateMeetingPreparationContext("meeting", "appearance", {
      text: "Context",
      version: 1,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/meetings/meeting/topics/appearance/preparation-context",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ text: "Context", version: 1 }),
      }),
    );
  });
  it("writes one or more inline Topic fields through the narrow patch endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ membershipStatusSignal: "attention" }));
    vi.stubGlobal("fetch", fetch);

    await api.updateMeetingTopicFields("meeting", "appearance", {
      membershipStatusSignal: "attention",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/meetings/meeting/topics/appearance/fields",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ membershipStatusSignal: "attention" }),
      }),
    );
  });
  it("formats users and meetings and retains the local calendar date", () => {
    expect(formatUser()).toBe("Unassigned");
    expect(formatUser({ firstName: "Ada", lastName: "Lovelace" } as any)).toBe(
      "Ada Lovelace",
    );
    expect(meetingLabel({ title: "Council", date: "2026-07-15" })).toBe(
      "Council",
    );
    expect(meetingLabel({ title: null, date: "2026-07-15" })).toContain(
      "Leadership meeting",
    );
    expect(toLocalDate(null)).toBeNull();
    expect(toLocalDate(new Date(2026, 6, 15))).toBe("2026-07-15");
  });
});
