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
  };
  const scalars = { validateWrite: jest.fn() };
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
});
