import { afterEach, describe, expect, it, vi } from "vitest";
import { api, formatUser, meetingLabel, request, toLocalDate } from "./domain";
import sodium from "libsodium-wrappers-sumo";
import { bytesToBase64Url } from "../e2ee/protocol";
import { meetingFragmentId } from "../e2ee/meeting-document-codec";
import { Decoder, Encoder } from "cbor-x";
import { meetingDocumentSession } from "../e2ee/meeting-document-session";
import {
  MEETING_COLLABORATION_ORIGIN,
  meetingCollaboration,
} from "../e2ee/meeting-collaboration";
import { scalarSession } from "../e2ee/scalar-session";

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
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("uses the API base URL, JSON header, and caller headers", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: "one" }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      request("/api/example", { headers: { Authorization: "Bearer token" } }),
    ).resolves.toEqual({ id: "one" });
    expect(fetch).toHaveBeenCalledWith("/api/example", {
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
      .mockResolvedValueOnce(binaryResponse(Uint8Array.from([4, 5, 6])))
      .mockResolvedValueOnce(binaryResponse(Uint8Array.from(new Encoder({
        mapsAsObjects: false,
        structuredClone: false,
        tagUint8Array: false,
        useRecords: false,
      }).encode([1, [["ock", 1, Uint8Array.from([4, 5, 6])]]]))));
    vi.stubGlobal("fetch", fetch);

    await expect(api.e2eeKeyState()).resolves.toMatchObject({
      ...metadata,
      sharedPassphraseSlot: "AQID",
      contentKeyWrapper: "BAUG",
      contentKeyWrappers: [{ ockId: "ock", ockEpoch: 1, wrapper: "BAUG" }],
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
      "/api/tasks?status=open&overdue=false",
    );
  });
  it("loads referenced users from the non-administrative directory endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    await api.userDirectory();
    expect(fetch).toHaveBeenCalledWith(
      "/api/user-directory",
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
      "/api/tasks/references",
      expect.any(Object),
    );
  });
  it("projects locked dashboard summaries without description or Meeting-title overfetch", async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      currentMeeting: null,
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
      "/api/topics/topic/history",
      expect.any(Object),
    );
  });
  it("requests future Meeting suggestions explicitly", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);

    await api.meetingSuggestions("meeting", { future: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/meetings/meeting/suggestions?future=true",
      expect.any(Object),
    );
  });
  it("hydrates the previous Meeting appearance for agenda preparation context", async () => {
    const priorWorkspace = {
      meetingId: "prior-meeting",
      documentId: "prior-document",
      activeSnapshotId: "prior-snapshot",
      currentServerSequence: "0",
      snapshot: {},
      updates: [],
    };
    const fetch = vi.fn().mockResolvedValue(response({
      id: "meeting",
      protected: null,
      date: "2026-09-02",
      beginTime: "19:00",
      status: "planned",
      agenda: [{
        id: "appearance",
        meetingId: "meeting",
        topicId: "topic",
        sectionId: "section",
        position: 1,
        plannedDuration: null,
        status: "planned",
        previousAppearance: {
          appearanceId: "prior-appearance",
          meetingId: "prior-meeting",
        },
        topic: {
          id: "topic",
          type: "generic",
          status: "open",
          protected: null,
          updates: [],
        },
      }],
      workspace: {
        meetingId: "meeting",
        documentId: "document",
        activeSnapshotId: "snapshot",
        currentServerSequence: "0",
        snapshot: {},
        updates: [],
        priorDocuments: [priorWorkspace],
      },
    }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(meetingDocumentSession, "load").mockResolvedValue();
    vi.spyOn(meetingDocumentSession, "hydrateFragments")
      .mockImplementation((sessionId: string) => ({
        generalNotes: "",
        openingInput: "",
        appearances: new Map([[sessionId === "prior:prior-document"
          ? "prior-appearance"
          : "appearance", sessionId === "prior:prior-document"
          ? {
              preparationContext: "Earlier preparation",
              personNote: null,
              meetingMinutes: "Earlier minutes",
            }
          : {
              preparationContext: "Current preparation",
              personNote: null,
              meetingMinutes: "",
            }]]),
      }));

    const result = await api.meeting("meeting");

    expect(result.agenda?.[0].previousAppearance).toMatchObject({
      appearanceId: "prior-appearance",
      preparationContext: { text: "Earlier preparation" },
      meetingMinutes: { text: "Earlier minutes" },
    });
  });
  it("keeps the active collaborative document attached while refreshing Meeting data", async () => {
    const workspace = {
      meetingId: "meeting",
      documentId: "document",
      activeSnapshotId: "snapshot",
      currentServerSequence: "23",
      snapshot: {},
      updates: [],
      priorDocuments: [{
        meetingId: "prior-meeting",
        documentId: "prior-document",
        activeSnapshotId: "prior-snapshot",
        currentServerSequence: "4",
        snapshot: {},
        updates: [],
      }],
    };
    const fetch = vi.fn().mockResolvedValue(response({
      id: "meeting",
      protected: null,
      date: "2026-09-05",
      beginTime: "19:00",
      status: "in_progress",
      agenda: [],
      workspace,
    }));
    vi.stubGlobal("fetch", fetch);
    const synchronize = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: "meeting",
      synchronize,
    } as any);
    vi.spyOn(scalarSession, "isUnlocked").mockReturnValue(true);
    const start = vi.spyOn(meetingCollaboration, "start");
    const load = vi.spyOn(meetingDocumentSession, "load").mockResolvedValue();
    vi.spyOn(meetingDocumentSession, "hydrateFragments").mockReturnValue({
      generalNotes: "Current notes",
      openingInput: "",
      appearances: new Map(),
    });

    const result = await api.meeting("meeting");

    expect(result.generalNotes).toBe("Current notes");
    expect(synchronize).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(
      "prior:prior-document",
      workspace.priorDocuments[0],
    );
    expect(start).not.toHaveBeenCalled();
  });
  it("keeps current collaborative text when an in-place refresh cannot synchronize", async () => {
    const fetch = vi.fn().mockResolvedValue(response({
      id: "meeting",
      protected: null,
      date: "2026-09-05",
      beginTime: "19:00",
      status: "in_progress",
      agenda: [],
      workspace: {
        meetingId: "meeting",
        documentId: "document",
        activeSnapshotId: "snapshot",
        currentServerSequence: "23",
        snapshot: {},
        updates: [],
      },
    }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({
      meetingId: "meeting",
      synchronize: vi.fn().mockRejectedValue(new Error("Network unavailable")),
    } as any);
    vi.spyOn(scalarSession, "isUnlocked").mockReturnValue(true);
    vi.spyOn(meetingDocumentSession, "hydrateFragments").mockReturnValue({
      generalNotes: "Unsaved current notes",
      openingInput: "",
      appearances: new Map(),
    });

    const result = await api.meeting("meeting");

    expect(result.generalNotes).toBe("Unsaved current notes");
  });
  it("sends representative GET/PUT/DELETE requests and a mutable meeting-topic payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await api.topic("topic");
    await api.updateMeetingTopic("meeting", "item", { deferred: true });
    await api.deleteSection("section");
    expect(fetch.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["/api/topics/topic", undefined],
      ["/api/meetings/meeting/topics/item", "PUT"],
      ["/api/agenda-sections/section", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      deferred: true,
    });
  });
  it("sends only the intended duration or status patch, including one minute and clearing", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    await api.updateMeetingTopic("meeting", "item", { plannedDuration: 1 });
    await api.updateMeetingTopic("meeting", "item", { status: "done" });
    await api.updateMeetingTopic("meeting", "item", { plannedDuration: null });
    expect(fetch.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
      { plannedDuration: 1 }, { status: "done" }, { plannedDuration: null },
    ]);
  });
  it("serializes an optional insertion position and complete transactional reorder payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(meetingDocumentSession, "createFragmentUpdate").mockResolvedValue("AQID");
    await api.addMeetingTopic("meeting", { topicId: "topic", sectionId: "section", position: 2 });
    await api.reorderMeetingTopics("meeting", [
      { id: "item-1", sectionId: "section", position: 1 },
      { id: "item-2", sectionId: "section", position: 2 },
    ]);
    expect(fetch.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["/api/meetings/meeting/topics", "POST"],
      ["/api/meetings/meeting/topics/order", "PUT"],
    ]);
    const mutation = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(fetch.mock.calls[0][1].body) as unknown[];
    expect(mutation).toEqual([
      expect.any(String),
      expect.any(String),
      "topic",
      "section",
      expect.any(Uint8Array),
      null,
      false,
      2,
      true,
      null,
      false,
      null,
      false,
    ]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
        items: [
          { id: "item-1", sectionId: "section", position: 1 },
          { id: "item-2", sectionId: "section", position: 2 },
        ],
      });
  });
  it.each(["generic", "person", "new_membership", "recurring"])(
    "copies a first %s Topic description into its Meeting appearance",
    async (type) => {
      const fetch = vi.fn().mockResolvedValue(response({ id: "target-appearance" }));
      vi.stubGlobal("fetch", fetch);
      const createUpdate = vi.spyOn(meetingDocumentSession, "createFragmentUpdate")
        .mockResolvedValue("AQID");

      await api.addMeetingTopic("target-meeting", {
        topicId: "topic",
        sectionId: "section",
        topic: { type, description: "Topic description" } as any,
      });

      expect(createUpdate).toHaveBeenCalledWith(
        "target-meeting",
        expect.stringMatching(type === "person"
          ? /^appearance\/[^/]+\/person-note$/
          : /^appearance\/[^/]+\/preparation-context$/),
        "Topic description",
        MEETING_COLLABORATION_ORIGIN,
      );
    },
  );
  it.each(["generic", "new_membership"])(
    "leaves a returning %s Topic preparation empty instead of reusing its description",
    async (type) => {
      const fetch = vi.fn().mockResolvedValue(response({ id: "target-appearance" }));
      vi.stubGlobal("fetch", fetch);
      const createUpdate = vi.spyOn(meetingDocumentSession, "createFragmentUpdate")
        .mockResolvedValue("AQID");

      await api.addMeetingTopic("target-meeting", {
        topicId: "topic",
        sectionId: "section",
        topic: {
          type,
          description: "Topic description",
          isNew: false,
          previousAppearance: {
            id: "source-appearance",
            meetingId: "source-meeting",
          },
        } as any,
      });

      expect(createUpdate).toHaveBeenCalledWith(
        "target-meeting",
        expect.stringMatching(/^appearance\/[^/]+\/preparation-context$/),
        "",
        MEETING_COLLABORATION_ORIGIN,
      );
    },
  );
  it("adds preselected Topics with one encrypted document update and one request", async () => {
    const fetch = vi.fn().mockResolvedValue(response([
      { id: "appearance-1" },
      { id: "appearance-2" },
    ]));
    vi.stubGlobal("fetch", fetch);
    const createUpdate = vi.spyOn(meetingDocumentSession, "createFragmentsUpdate")
      .mockResolvedValue("Bwg");

    await api.addMeetingTopics("meeting", [
      {
        topicId: "00000000-0000-4000-8000-000000000001",
        sectionId: "00000000-0000-4000-8000-000000000002",
        topic: { type: "generic", description: "First description", isNew: true } as any,
      },
      {
        topicId: "00000000-0000-4000-8000-000000000003",
        sectionId: "00000000-0000-4000-8000-000000000004",
        topic: {
          type: "new_membership",
          description: "Second description",
          isNew: true,
        } as any,
      },
    ]);

    expect(createUpdate).toHaveBeenCalledWith(
      "meeting",
      [
        expect.objectContaining({ value: "First description" }),
        expect.objectContaining({ value: "Second description" }),
      ],
      MEETING_COLLABORATION_ORIGIN,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/meetings/meeting/topics/batch",
      expect.objectContaining({ method: "POST" }),
    );
    const mutation = new Decoder({ mapsAsObjects: false, useRecords: false })
      .decode(fetch.mock.calls[0][1].body) as unknown[];
    expect(mutation[0]).toEqual(Uint8Array.from([7, 8]));
    expect(mutation[1]).toHaveLength(2);
  });
  it("copies the current recurring description instead of prior Preparation context", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: "target-appearance" }));
    vi.stubGlobal("fetch", fetch);
    const createUpdate = vi.spyOn(meetingDocumentSession, "createFragmentUpdate")
      .mockResolvedValue("AQID");

    await api.addMeetingTopic("target-meeting", {
      topicId: "topic",
      sectionId: "section",
      topic: { type: "recurring", description: "Template" } as any,
      source: "recurrence",
      sourceAppearance: { id: "source-appearance", meetingId: "source-meeting" },
    });

    expect(createUpdate).toHaveBeenCalledWith(
      "target-meeting",
      expect.stringMatching(/^appearance\/[^/]+\/preparation-context$/),
      "Template",
      MEETING_COLLABORATION_ORIGIN,
    );
  });
  it("copies a Person note from the prior Meeting into the target Person fragment", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ documentId: "source-document" }))
      .mockResolvedValueOnce(response({ id: "target-appearance" }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(meetingDocumentSession, "load").mockResolvedValue();
    vi.spyOn(meetingDocumentSession, "hydrateFragments").mockReturnValue({
      generalNotes: "",
      openingInput: "",
      appearances: new Map([["source-appearance", {
        preparationContext: null,
        personNote: "Prior Person note",
        meetingMinutes: null,
      }]]),
    });
    const createUpdate = vi.spyOn(meetingDocumentSession, "createFragmentUpdate")
      .mockResolvedValue("AQID");

    await api.addMeetingTopic("target-meeting", {
      topicId: "topic",
      sectionId: "section",
      topic: { type: "person" } as any,
      sourceAppearance: { id: "source-appearance", meetingId: "source-meeting" },
    });

    expect(createUpdate).toHaveBeenCalledWith(
      "target-meeting",
      expect.stringMatching(/^appearance\/[^/]+\/person-note$/),
      "Prior Person note",
      MEETING_COLLABORATION_ORIGIN,
    );
  });
  it("uses the explicit completion action without a mutable Meeting payload", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ status: "completed" }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetch);

    await api.completeMeeting("meeting");

    expect(fetch).toHaveBeenCalledWith(
      "/api/meetings/meeting/complete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
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
      "/api/meetings/meeting/topics/appearance/fields",
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


describe("encrypted preparation history", () => {
  const current = "00000000-0000-4000-8000-000000000301";
  const october = "00000000-0000-4000-8000-000000000302";
  const september = "00000000-0000-4000-8000-000000000303";
  const epoch = "00000000-0000-4000-8000-000000000304";

  afterEach(() => {
    meetingDocumentSession.lock();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup(text: string, minutes = "", options: {
    unavailable?: "missing" | "corrupt";
    type?: "generic" | "person";
    olderPreparation?: string;
  } = {}) {
    const type = options.type ?? "generic";
    await sodium.ready;
    const signing = sodium.crypto_sign_seed_keypair(new Uint8Array(32).fill(9), "uint8array");
    meetingDocumentSession.unlock({
      organizationId: "00000000-0000-4000-8000-000000000305",
      ockId: "00000000-0000-4000-8000-000000000306",
      clientEpochId: epoch,
      noncePrefix: new Uint8Array(16).fill(5),
      contentKey: new Uint8Array(32).fill(6),
      signingPrivateKey: signing.privateKey,
    });
    async function workspace(id: string, appearance: string, preparation: string, minutes: string) {
      const initial = await meetingDocumentSession.createInitial(id);
      const updates = [];
      for (const [fragment, value] of [["preparationContext", preparation], ["meetingMinutes", minutes]] as const) {
        const envelope = await meetingDocumentSession.createFragmentUpdate(id, meetingFragmentId(fragment, appearance), value);
        updates.push({ clientEpochId: epoch, authorClock: String(updates.length + 1), signingPublicKey: bytesToBase64Url(signing.publicKey), envelope });
      }
      return { meetingId: id, documentId: initial.documentId, activeSnapshotId: initial.snapshotId, currentServerSequence: "2",
        snapshot: { id: initial.snapshotId, clientEpochId: epoch, snapshotClock: "1", signingPublicKey: bytesToBase64Url(signing.publicKey), envelope: initial.snapshotEnvelope }, updates };
    }
    const currentWorkspace = await workspace(current, "current", "Current preparation", "");
    const octoberWorkspace = await workspace(october, "october", text, minutes);
    const septemberWorkspace = await workspace(september, "september", options.olderPreparation ?? "<p>September context</p>", "");
    const dates = ["2026-09-01T18:59:00", "2026-09-01T19:00:00", "2026-09-01T19:01:00", "2026-11-01T19:00:00", "2026-11-01T19:01:00"];
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === `/api/meetings/${current}`) return response({ id: current, protected: null, date: "2026-11-01", beginTime: "19:00", status: "planned", workspace: currentWorkspace,
        agenda: [{ id: "current", meetingId: current, topicId: "topic", status: "planned", preparationHistory: [
          { appearanceId: "october", meetingId: october, date: "2026-10-01", beginTime: "19:00", status: "deferred", documentRevision: { documentId: octoberWorkspace.documentId, activeSnapshotId: octoberWorkspace.activeSnapshotId, currentServerSequence: octoberWorkspace.currentServerSequence } },
          { appearanceId: "september", meetingId: september, date: "2026-09-01", beginTime: "19:00", documentRevision: { documentId: septemberWorkspace.documentId, activeSnapshotId: septemberWorkspace.activeSnapshotId, currentServerSequence: septemberWorkspace.currentServerSequence } },
        ], topic: { id: "topic", type, protected: null, updates: dates.map((date, i) => ({ id: `update-${i}`, topicId: "topic", type: "update", date, protected: null })) } }],
      });
      if (url === `/api/meetings/${october}/workspace`) return response(options.unavailable === "missing"
        ? null
        : options.unavailable === "corrupt"
          ? { ...octoberWorkspace, snapshot: { ...octoberWorkspace.snapshot, envelope: "invalid" } }
          : octoberWorkspace);
      if (url === `/api/meetings/${september}/workspace`) return response(septemberWorkspace);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-12-01T12:00:00").getTime());
    return fetch;
  }

  it("skips formatting-only postponed notes and bounds updates by the selected scheduled meeting and historical cutoff", async () => {
    await setup("<p><strong> &nbsp; </strong><br></p>");
    const result = await api.meeting(current);
    expect(result.agenda?.[0].previousAppearance).toMatchObject({ appearanceId: "september", date: "2026-09-01", preparationContext: { text: "<p>September context</p>" } });
    expect(result.agenda?.[0].preparationUpdates?.map((update) => update.id)).toEqual(["update-2", "update-3"]);
    expect(result.agenda?.[0].preparationContext?.text).toBe("Current preparation");
  });
  it.each([
    ["<p>October preparation</p>", ""],
    ["", "<p>October minutes</p>"],
  ])("selects a meaningful postponed appearance with preparation %s or minutes %s", async (preparation, minutes) => {
    const fetch = await setup(preparation, minutes);
    const result = await api.meeting(current);
    expect(result.agenda?.[0].previousAppearance?.appearanceId).toBe("october");
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain(`/api/meetings/${september}/workspace`);
  });

  it("reports unavailable history without skipping it or losing current notes", async () => {
    const fetch = await setup("", "", { unavailable: "missing" });
    const result = await api.meeting(current);
    expect(result.agenda?.[0]).toMatchObject({ previousAppearance: null, preparationHistoryUnavailable: true, preparationUpdates: [], preparationContext: { text: "Current preparation" } });
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain(`/api/meetings/${september}/workspace`);
  });

  it("never loads Person Topic history and preserves its current editable note", async () => {
    const fetch = await setup("Old person context", "", { type: "person" });
    await meetingDocumentSession.createFragmentUpdate(current, meetingFragmentId("personNote", "current"), "Current person note");
    // Preserve the real attached document while the structural response refreshes.
    vi.spyOn(meetingCollaboration, "get").mockReturnValue({ synchronize: async () => {} } as never);
    const result = await api.meeting(current);
    expect(result.agenda?.[0]).toMatchObject({ previousAppearance: null, preparationUpdates: [], personNote: { text: "Current person note" } });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/api/meetings/${current}`]);
  });

  it("includes updates only through now for upcoming preparation", async () => {
    await setup("", "");
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-01T19:01:00").getTime());
    const result = await api.meeting(current);
    expect(result.agenda?.[0].preparationUpdates?.map((update) => update.id)).toEqual(["update-2"]);
  });

  it("reuses unchanged prior documents across preparation reloads in the same unlock session", async () => {
    const fetch = await setup("");
    await api.meeting(current);
    const result = await api.meeting(current);
    expect(result.agenda?.[0].previousAppearance?.appearanceId).toBe("september");
    expect(fetch.mock.calls.filter(([url]) => url === `/api/meetings/${october}/workspace`)).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => url === `/api/meetings/${september}/workspace`)).toHaveLength(1);
  });

  it("shows all updates through the cutoff when every earlier appearance is empty", async () => {
    await setup("   ", "<p><br></p>", { olderPreparation: "<p>&nbsp;</p>" });
    const result = await api.meeting(current);
    expect(result.agenda?.[0].previousAppearance).toBeNull();
    expect(result.agenda?.[0].preparationUpdates?.map((update) => update.id)).toEqual(["update-0", "update-1", "update-2", "update-3"]);
  });

  it("does not treat an undecryptable appearance as empty", async () => {
    const fetch = await setup("", "", { unavailable: "corrupt" });
    const result = await api.meeting(current);
    expect(result.agenda?.[0].preparationHistoryUnavailable).toBe(true);
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain(`/api/meetings/${september}/workspace`);
  });

  it("reloads a changed prior document instead of using a stale revision", async () => {
    const fetch = await setup("");
    await api.meeting(current);
    const structural = await (await fetch(`/api/meetings/${current}`)).json();
    structural.agenda[0].preparationHistory[0].documentRevision.currentServerSequence = "3";
    fetch.mockResolvedValueOnce(response(structural));
    await api.meeting(current);
    expect(fetch.mock.calls.filter(([url]) => url === `/api/meetings/${october}/workspace`)).toHaveLength(2);
  });

  it("uses same-day scheduled start times and shows duplicate updates once in chronological order", async () => {
    const fetch = await setup("October context");
    const structural = await (await fetch(`/api/meetings/${current}`)).json();
    structural.agenda[0].preparationHistory[0].date = "2026-11-01";
    structural.agenda[0].preparationHistory[0].beginTime = "18:00";
    structural.agenda[0].preparationHistory[1].date = "2026-11-01";
    structural.agenda[0].preparationHistory[1].beginTime = "17:00";
    const update = { id: "between-meetings", topicId: "topic", type: "update", date: "2026-11-01T18:30:00", protected: null };
    structural.agenda[0].topic.updates = [
      structural.agenda[0].topic.updates[3], update, update,
      { ...update, id: "at-source-start", date: "2026-11-01T18:00:00" },
      { ...update, id: "after-cutoff", date: "2026-11-01T19:01:00" },
    ];
    fetch.mockResolvedValueOnce(response(structural));
    const result = await api.meeting(current);
    expect(result.agenda?.[0].previousAppearance).toMatchObject({ appearanceId: "october", date: "2026-11-01", beginTime: "18:00" });
    expect(result.agenda?.[0].preparationUpdates?.map((entry) => entry.id)).toEqual(["between-meetings", "update-3"]);
  });

});
