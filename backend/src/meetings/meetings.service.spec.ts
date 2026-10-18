import { In, LessThan } from "typeorm";
import { MeetingDocumentMutation } from "./meeting-document-mutation.entity";
import { MeetingTopic } from "./meeting-topic.entity";
import { MeetingsService } from "./meetings.service";
import { Topic } from "../topics/topic.entity";
import { AgendaSection } from "../agenda-sections/agenda-section.entity";

describe("MeetingsService encrypted transaction boundaries", () => {
  const documents = {
    assertContentUser: jest.fn(),
    createInitial: jest.fn(),
    appendUpdate: jest.fn(),
    bootstrap: jest.fn(),
    storedUpdateMatches: jest.fn(),
    compact: jest.fn(),
  };
  const scalars = { validateWrite: jest.fn() };
  const compactions = {
    abortMeeting: jest.fn(),
    beginCompletion: jest.fn().mockResolvedValue({ barrierId: "completion", serverSequence: "7" }),
    claim: jest.fn(),
    claimCompletionSubmission: jest.fn().mockReturnValue("document"),
    assertClaim: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    beginExternalUpdate: jest.fn().mockReturnValue(true),
    endExternalUpdate: jest.fn(),
  };
  const manager = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    find: jest.fn(),
    countBy: jest.fn(),
    create: jest.fn((_entity: unknown, input: unknown) => input),
    save: jest.fn(async (_entity: unknown, input?: unknown) => input ?? _entity),
    remove: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (value: typeof manager) => unknown) => work(manager)),
  };
  const repository = { manager, exists: jest.fn() };
  const service = new MeetingsService(
    dataSource as never,
    repository as never,
    repository as never,
    repository as never,
    repository as never,
    repository as never,
    repository as never,
    repository as never,
    { apply: jest.fn() } as never,
    { validate: jest.fn() } as never,
    scalars as never,
    documents as never,
    compactions as never,
  );
  const user = { id: "user", role: "admin" } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === Topic) return { id: "topic", type: "generic" };
      return { id: "meeting", status: "planned" };
    });
    manager.findOneBy.mockImplementation(async (entity) => {
      if (entity === AgendaSection) return { id: "section" };
      return null;
    });
    manager.find.mockResolvedValue([]);
    documents.appendUpdate.mockResolvedValue({ update: { id: "update" }, duplicate: false });
    documents.compact.mockResolvedValue({ status: "compacted" });
    compactions.claim.mockReturnValue("100");
    compactions.beginExternalUpdate.mockReturnValue(true);
  });

  it("commits a snapshot only for the exact sequence released by the compaction barrier", async () => {
    await expect(service.compactWorkspace(
      "meeting",
      "snapshot",
      "opaque",
      "barrier",
      user,
    )).resolves.toEqual({ status: "compacted" });

    expect(compactions.claim).toHaveBeenCalledWith("meeting", "barrier", "user");
    expect(manager.query).toHaveBeenNthCalledWith(1, "SET LOCAL lock_timeout = '5s'");
    expect(manager.query).toHaveBeenNthCalledWith(2, "SET LOCAL statement_timeout = '5s'");
    expect(documents.compact).toHaveBeenCalledWith(
      manager,
      user,
      "meeting",
      "snapshot",
      "opaque",
      "100",
    );
    expect(compactions.complete).toHaveBeenCalledWith("meeting", "barrier");
  });

  it("releases the compaction barrier when snapshot validation fails", async () => {
    documents.compact.mockRejectedValueOnce(new Error("stale snapshot"));

    await expect(service.compactWorkspace(
      "meeting",
      "snapshot",
      "opaque",
      "barrier",
      user,
    )).rejects.toThrow("stale snapshot");

    expect(compactions.fail).toHaveBeenCalledWith("meeting", "barrier");
    expect(compactions.complete).not.toHaveBeenCalled();
  });

  it("rejects an external document write while a compaction commit is in progress", async () => {
    compactions.beginExternalUpdate.mockReturnValueOnce(false);

    await expect(service.appendWorkspaceUpdate(
      "meeting",
      "opaque",
      user,
    )).rejects.toThrow("Meeting compaction is committing");

    expect(documents.assertContentUser).toHaveBeenCalledWith(user);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("allows a Superadmin to complete an in-progress Meeting without being assigned", async () => {
    const meeting = {
      id: "meeting",
      status: "in_progress",
      meetingLeaderId: "leader",
      minuteTakerId: "minute-taker",
    };
    const document = {
      meetingId: "meeting",
      currentServerSequence: "7",
      completedServerSequence: null,
    };
    manager.findOne.mockResolvedValue(meeting);
    manager.findOneBy.mockResolvedValue({ id: "superadmin", role: "superadmin" });
    manager.findOneByOrFail.mockResolvedValue(document);
    manager.find.mockResolvedValue([]);

    await expect(service.complete("meeting", {
      id: "superadmin",
      role: "superadmin",
    } as never, { barrierId: "completion", documentId: "document", serverSequence: "7", proofEnvelope: "opaque", appearances: [] })).resolves.toEqual(expect.objectContaining({
      id: "meeting",
      status: "completed",
    }));

    expect(document.completedServerSequence).toBe("7");
    expect(meeting).toEqual(expect.objectContaining({
      meetingLeaderId: "leader",
      minuteTakerId: "minute-taker",
    }));
  });

  it("does not allow another unassigned role to complete an in-progress Meeting", async () => {
    manager.findOne.mockResolvedValue({
      id: "meeting",
      status: "in_progress",
      meetingLeaderId: "leader",
      minuteTakerId: "minute-taker",
    });

    await expect(service.prepareCompletion("meeting", {
      id: "unassigned-admin",
      role: "admin",
    } as never, { proofEnvelope: "opaque" })).rejects.toThrow(
      "Only a Superadmin, the Meeting leader, or the Minute taker can complete this Meeting",
    );

    expect(manager.find).not.toHaveBeenCalled();
  });

  it("does not persist appearance structure when the initial opaque update fails", async () => {
    documents.appendUpdate.mockRejectedValueOnce(new Error("invalid update"));

    await expect(service.addTopic("meeting", {
      id: "appearance",
      mutationId: "mutation",
      topicId: "topic",
      sectionId: "section",
      initialUpdateEnvelope: "opaque",
    } as never, user)).rejects.toThrow("invalid update");

    expect(manager.save).not.toHaveBeenCalledWith(MeetingTopic, expect.anything());
    expect(manager.save).not.toHaveBeenCalledWith(MeetingDocumentMutation, expect.anything());
  });

  it("rejects insertion into an ambiguous section before writing an appearance", async () => {
    manager.find.mockResolvedValue([{ id: "first", position: 1 }, { id: "second", position: 1 }]);
    await expect(service.addTopic("meeting", {
      id: "appearance", mutationId: "mutation", topicId: "topic", sectionId: "section",
      initialUpdateEnvelope: "opaque",
    } as never, user)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "AGENDA_POSITIONS_INVALID" }),
    });
    expect(documents.appendUpdate).not.toHaveBeenCalled();
  });

  it("records structure, opaque update, and idempotency marker in one transaction", async () => {
    await service.addTopic("meeting", {
      id: "appearance",
      mutationId: "mutation",
      topicId: "topic",
      sectionId: "section",
      initialUpdateEnvelope: "opaque",
    } as never, user);

    expect(documents.appendUpdate).toHaveBeenCalledWith(
      manager,
      user,
      "meeting",
      "opaque",
    );
    expect(manager.save).toHaveBeenCalledWith(MeetingTopic, expect.objectContaining({
      id: "appearance",
      topicId: "topic",
    }));
    expect(manager.save).toHaveBeenCalledWith(MeetingDocumentMutation, expect.objectContaining({
      id: "mutation",
      updateId: "update",
    }));
  });

  it("reopens a deferred Topic when it is added to an agenda", async () => {
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === Topic) return { id: "topic", type: "generic", status: "deferred" };
      return { id: "meeting", status: "planned" };
    });

    await service.addTopic("meeting", {
      id: "appearance",
      mutationId: "mutation",
      topicId: "topic",
      sectionId: "section",
      initialUpdateEnvelope: "opaque",
    } as never, user);

    expect(manager.save).toHaveBeenCalledWith(Topic, expect.objectContaining({
      id: "topic",
      status: "open",
    }));
  });

  it("recognizes an exact mutation retry after compaction removed its covered update", async () => {
    const input = {
      id: "appearance",
      mutationId: "mutation",
      topicId: "topic",
      sectionId: "section",
      initialUpdateEnvelope: "opaque",
    };
    const fingerprint = (service as unknown as {
      meetingTopicRequestFingerprint: (value: typeof input) => Buffer;
    }).meetingTopicRequestFingerprint(input);
    const appearance = { id: "appearance", meetingId: "meeting" };
    manager.findOneBy.mockImplementation(async (entity) => {
      if (entity === MeetingDocumentMutation) {
        return {
          id: "mutation",
          meetingId: "meeting",
          appearanceId: "appearance",
          sourceAppearanceId: null,
          updateId: null,
          requestFingerprint: fingerprint,
        };
      }
      if (entity === MeetingTopic) return appearance;
      return null;
    });

    await expect(service.addTopic("meeting", input as never, user)).resolves.toBe(appearance);
    expect(documents.storedUpdateMatches).not.toHaveBeenCalled();
    expect(documents.appendUpdate).not.toHaveBeenCalled();
  });

  it("returns ordered preparation candidates without eagerly loading historical documents or person history", async () => {
    const findOne = jest.fn().mockResolvedValue({ id: "meeting", date: "2026-11-01", beginTime: "19:00", status: "planned" });
    const agenda = [
      { id: "current", meetingId: "meeting", topicId: "topic", topic: { id: "topic", type: "generic" } },
      { id: "person-current", meetingId: "meeting", topicId: "person", topic: { id: "person", type: "person" } },
      { id: "other-current", meetingId: "meeting", topicId: "other-topic", topic: { id: "other-topic", type: "generic" } },
    ];
    const find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(agenda)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "october", topicId: "topic", meetingId: "october-meeting", meeting: { date: "2026-10-01", beginTime: "19:00" } },
        { id: "september", topicId: "topic", meetingId: "september-meeting", meeting: { date: "2026-09-01", beginTime: "19:00" } },
        { id: "person-prior", topicId: "person", meetingId: "september-meeting", meeting: { date: "2026-09-01", beginTime: "19:00" } },
      ]);
    Object.assign(repository, { findOne, find });
    documents.bootstrap.mockResolvedValue({ documentId: "document" });

    const result = await service.findOne("meeting", user);

    expect(result.agenda[0]).toMatchObject({ preparationHistory: [
      { appearanceId: "october", meetingId: "october-meeting", date: "2026-10-01", beginTime: "19:00" },
      { appearanceId: "september", meetingId: "september-meeting", date: "2026-09-01", beginTime: "19:00" },
    ] });
    expect(result.agenda[1]).toMatchObject({ preparationHistory: [], previousAppearance: null });
    expect(result.agenda[2]).toMatchObject({ preparationHistory: [] });
    expect(find.mock.calls[4][0]).toMatchObject({
      where: [
        { topicId: In(["topic", "other-topic"]), meeting: { date: LessThan("2026-11-01") } },
        { topicId: In(["topic", "other-topic"]), meeting: { date: "2026-11-01", beginTime: LessThan("19:00") } },
      ],
      order: { meeting: { date: "DESC", beginTime: "DESC", id: "DESC" } },
    });
    expect(documents.bootstrap).toHaveBeenCalledTimes(1);
  });

  it("marks first appearances as new and suggests the most recent earlier section", async () => {
    const firstTopic = {
      id: "first-topic",
      type: "generic",
      status: "open",
      followUpDate: null,
      defaultSectionId: "default-section",
    } as Topic;
    const returningTopic = {
      id: "returning-topic",
      type: "person",
      status: "open",
      followUpDate: null,
      defaultSectionId: "default-section",
    } as Topic;
    (repository as { findOneBy?: jest.Mock }).findOneBy = jest.fn()
      .mockResolvedValue({ id: "meeting", date: "2026-09-15", beginTime: "19:00" });
    (repository as { find?: jest.Mock }).find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([firstTopic, returningTopic])
      .mockResolvedValueOnce([
        {
          id: "same-time-appearance",
          meetingId: "aaa",
          topicId: "returning-topic",
          sectionId: "wrong-section",
          position: 1,
          meeting: { id: "aaa", date: "2026-09-15", beginTime: "19:00" },
        },
        {
          id: "later-appearance",
          meetingId: "prior-meeting",
          topicId: "returning-topic",
          sectionId: "later-section",
          position: 4,
          meeting: { date: "2026-09-01", beginTime: "19:00" },
        },
        {
          id: "earlier-appearance",
          meetingId: "earlier-meeting",
          topicId: "returning-topic",
          sectionId: "earlier-section",
          meeting: { date: "2026-08-01", beginTime: "19:00" },
        },
      ]);
    (dataSource as { manager?: typeof manager }).manager = manager;

    await expect(service.suggestions("meeting", false, user)).resolves.toEqual([
      expect.objectContaining({
        id: "first-topic",
        isNew: true,
        previousSectionId: null,
      }),
      expect.objectContaining({
        id: "returning-topic",
        isNew: false,
        previousSectionId: "later-section",
        previousAppearance: {
          id: "later-appearance",
          meetingId: "prior-meeting",
          position: 4,
          date: "2026-09-01",
          beginTime: "19:00",
        },
      }),
    ]);
    expect((repository as unknown as { find: jest.Mock }).find.mock.calls[2][0].order).toEqual({
      meeting: { date: "DESC", beginTime: "DESC", id: "DESC" },
    });
  });

  it("inserts a consecutive carry-over block ahead of existing recurrence appearances", async () => {
    const stored = [
      { id: "recurrence", topicId: "recurring", meetingId: "meeting", sectionId: "section", position: 1, source: "recurrence" },
    ];
    manager.findOne.mockImplementation(async (entity, options) => entity === Topic
      ? { id: options.where.id, type: "person", status: "open" }
      : { id: "meeting", status: "planned" });
    manager.find.mockImplementation(async (entity, options) => entity === MeetingTopic
      ? stored.filter((item) => item.sectionId === options.where.sectionId)
        .sort((a, b) => a.position - b.position)
      : []);
    manager.save.mockImplementation(async (entity, input) => {
      if (entity === MeetingTopic && !Array.isArray(input)) {
        const appearance = input as typeof stored[number];
        if (!stored.some((item) => item.id === appearance.id)) stored.push(appearance);
      }
      return input;
    });

    const result = await service.addTopics("meeting", {
      initialUpdateEnvelope: "notes-update",
      items: [
        { id: "A", mutationId: "mutation-A", topicId: "A", sectionId: "section", position: 1 },
        { id: "B", mutationId: "mutation-B", topicId: "B", sectionId: "section", position: 2 },
        { id: "D", mutationId: "mutation-D", topicId: "D", sectionId: "section", position: 3 },
      ],
    }, user);

    expect(result.map(({ topicId, position }) => [topicId, position])).toEqual([
      ["A", 1], ["B", 2], ["D", 3],
    ]);
    expect(stored.find((item) => item.id === "recurrence")).toMatchObject({ position: 4, source: "recurrence" });
    expect(documents.appendUpdate).toHaveBeenCalledWith(manager, user, "meeting", "notes-update");
    manager.save.mockImplementation(async (_entity: unknown, input?: unknown) => input ?? _entity);
  });

  it("adds several Topic appearances with one encrypted document update in one transaction", async () => {
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === Topic) {
        return { id: options.where.id, type: "generic", status: "open" };
      }
      return { id: "meeting", status: "planned" };
    });
    manager.findOneBy.mockImplementation(async (entity) => {
      if (entity === AgendaSection) return { id: "section" };
      return null;
    });

    await service.addTopics("meeting", {
      initialUpdateEnvelope: "shared-opaque-update",
      items: [
        {
          id: "appearance-1",
          mutationId: "mutation-1",
          topicId: "topic-1",
          sectionId: "section",
        },
        {
          id: "appearance-2",
          mutationId: "mutation-2",
          topicId: "topic-2",
          sectionId: "section",
        },
      ],
    }, user);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(compactions.beginExternalUpdate).toHaveBeenCalledWith("meeting");
    expect(compactions.endExternalUpdate).toHaveBeenCalledWith("meeting");
    expect(documents.appendUpdate).toHaveBeenCalledTimes(1);
    expect(documents.appendUpdate).toHaveBeenCalledWith(
      manager,
      user,
      "meeting",
      "shared-opaque-update",
    );
    expect(manager.save).toHaveBeenCalledWith(MeetingTopic, expect.objectContaining({
      id: "appearance-1",
      topicId: "topic-1",
    }));
    expect(manager.save).toHaveBeenCalledWith(MeetingTopic, expect.objectContaining({
      id: "appearance-2",
      topicId: "topic-2",
    }));
  });
});
