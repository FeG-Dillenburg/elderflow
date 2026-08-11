import { afterEach, describe, expect, it, vi } from "vitest";
import { api, formatUser, meetingLabel, request, toLocalDate } from "./domain";
import { setProtectedContentUnlocked } from "../e2ee/content-visibility";
import { Decoder } from "cbor-x";

const response = (body: unknown, options: Partial<Response> = {}) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    ...options,
  }) as unknown as Response;

describe("domain API client", () => {
  afterEach(() => {
    setProtectedContentUnlocked(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
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
  it("transports key wrappers as authenticated CBOR bytes rather than JSON fields", async () => {
    const binaryResponse = (bytes: Uint8Array) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/vnd.elderflow.e2ee+cbor;v=1" }),
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(bytes).buffer),
    }) as unknown as Response;
    const metadata = {
      envelopeFormat: 1, cryptoSuite: 1, organizationId: "org", generation: 1,
      orkId: "ork", ockId: "ock", ockEpoch: 1,
      passphraseKdf: { version: 1, operationsLimit: 3, memoryLimit: 67_108_864, outputLength: 32 },
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(metadata))
      .mockResolvedValueOnce(binaryResponse(Uint8Array.from([1, 2, 3])))
      .mockResolvedValueOnce(binaryResponse(Uint8Array.from([4, 5, 6])));
    vi.stubGlobal("fetch", fetch);

    await expect(api.e2eeKeyState()).resolves.toMatchObject({
      ...metadata,
      sharedPassphraseSlot: "AQID",
      contentKeyWrapper: "BAUG",
    });
    expect(fetch.mock.calls.slice(1).every((call) => call[1].headers.Accept === "application/vnd.elderflow.e2ee+cbor;v=1")).toBe(true);
  });

  it("sends initial wrappers as canonical CBOR byte strings", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: "user" }));
    vi.stubGlobal("fetch", fetch);
    await api.createInitialUser({
      defaultLanguage: "en", setupPassword: "setup-password", email: "ada@example.com",
      firstName: "Ada", lastName: "Lovelace", password: "password123!",
      e2ee: {
        organizationId: "00000000-0000-4000-8000-000000000001",
        orkId: "00000000-0000-4000-8000-000000000003",
        ockId: "00000000-0000-4000-8000-000000000004",
        sharedPassphraseSlot: "AQID", recoverySlot: "BAUG", contentKeyWrapper: "BwgJ",
        custodyCopiesAcknowledged: 2,
      },
    });

    const requestOptions = fetch.mock.calls[0][1];
    expect(requestOptions.headers["Content-Type"]).toBe("application/vnd.elderflow.e2ee+cbor;v=1");
    const decoded = new Decoder({ mapsAsObjects: false, useRecords: false }).decode(requestOptions.body) as unknown[];
    expect(decoded[6]).toEqual(expect.arrayContaining([
      expect.any(Uint8Array),
    ]));
    expect((decoded[6] as unknown[]).slice(3, 6)).toEqual([
      Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5, 6]), Uint8Array.from([7, 8, 9]),
    ]);
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
  it("loads narrow Task references with explicit unavailable Meeting labels", async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      topics: [{ id: "topic", protected: null }],
      meetings: [{
        id: "meeting",
        date: "2026-08-20",
        beginTime: "19:30",
        status: "planned",
      }],
    }));
    vi.stubGlobal("fetch", fetch);

    await expect(api.taskReferences()).resolves.toEqual({
      topics: [{ id: "topic", name: "Protected text is unavailable." }],
      meetings: [expect.objectContaining({
        id: "meeting",
        title: "Protected text is unavailable.",
      })],
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/tasks/references",
      expect.any(Object),
    );
  });
  it("projects locked dashboard summaries without description or Meeting-title overfetch", async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      nextMeeting: {
        id: "meeting",
        date: "2026-08-20",
        beginTime: "19:30",
        status: "planned",
        meetingLeaderId: null,
        meetingLeader: null,
      },
      myOpenTasks: [{
        id: "task",
        topicId: null,
        meetingId: null,
        assignedToId: null,
        assignedTo: null,
        dueDate: null,
        status: "open",
        completedAt: null,
        protected: { titleEnvelope: "opaque", titleCommitRevision: "1" },
      }],
      overdueTasks: [],
      followUpTopics: [],
      recentTopics: [],
    }));
    vi.stubGlobal("fetch", fetch);

    const dashboard = await api.dashboard();

    expect(dashboard.nextMeeting?.title).toBe("Protected text is unavailable.");
    expect(dashboard.myOpenTasks[0].title).toBe("Unlock Protected text to view this content.");
    expect(dashboard.myOpenTasks[0]).not.toHaveProperty("description");
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
  it("localizes server-redacted Protected text while preserving structural fields", async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      id: "topic", type: "general", status: "open", followUpDate: "2026-08-10",
      name: "__ELDERFLOW_PROTECTED_TEXT_REDACTED__",
      description: "__ELDERFLOW_PROTECTED_TEXT_REDACTED__",
    }));
    vi.stubGlobal("fetch", fetch);

    await expect(api.topic("topic")).resolves.toMatchObject({
      id: "topic", status: "open", followUpDate: "2026-08-10",
      name: "Protected text is unavailable.",
      description: "Protected text is unavailable.",
    });
  });

  it("only advertises the local development plaintext path while unlocked", async () => {
    vi.stubEnv("VITE_E2EE_DEVELOPMENT_GATE", "true");
    const fetch = vi.fn().mockResolvedValue(response({ id: "one" }));
    vi.stubGlobal("fetch", fetch);

    await request("/api/topics");
    setProtectedContentUnlocked(true);
    await request("/api/topics");

    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("X-Elderflow-E2EE-Unlocked");
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ "X-Elderflow-E2EE-Unlocked": "1" });
  });
  it("describes redacted local development content as locked until unlock", async () => {
    vi.stubEnv("VITE_E2EE_DEVELOPMENT_GATE", "true");
    const fetch = vi.fn().mockResolvedValue(response({
      title: "__ELDERFLOW_PROTECTED_TEXT_REDACTED__",
    }));
    vi.stubGlobal("fetch", fetch);

    await expect(request("/api/tasks/task")).resolves.toMatchObject({
      title: "Unlock Protected text to view this content.",
    });
  });
  it("requests future Meeting suggestions explicitly", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);

    await api.meetingSuggestions("meeting", { future: true });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/meetings/meeting/suggestions?future=true",
      expect.any(Object),
    );
  });
  it("sends representative GET/PUT/DELETE requests and a mutable meeting-topic payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await api.topic("topic");
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
      ["http://localhost:3000/api/meetings/meeting/topics/item", "PUT"],
      ["http://localhost:3000/api/agenda-sections/section", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
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
    const fetch = vi.fn().mockResolvedValue(response({
      id: "topic",
      type: "new_membership",
      membershipStatusSignal: "attention",
      protected: null,
    }));
    vi.stubGlobal("fetch", fetch);

    const saved = await api.updateMeetingTopicFields("meeting", "appearance", {
      membershipStatusSignal: "attention",
    });

    expect(saved).toMatchObject({
      id: "topic",
      membershipStatusSignal: "attention",
      name: expect.any(String),
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
