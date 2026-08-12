import { getRepositoryToken } from "@nestjs/typeorm";
import { Test } from "@nestjs/testing";
import { In } from "typeorm";
import { E2eeScalarService } from "../e2ee/e2ee-scalar.service";
import { MeetingTopic } from "../meetings/meeting-topic.entity";
import { RecurrenceService } from "../recurrence/recurrence.service";
import { User } from "../users/user.entity";
import { TopicUpdate } from "./topic-update.entity";
import { Topic } from "./topic.entity";
import { TopicsService } from "./topics.service";

describe("TopicsService encrypted contracts", () => {
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    getRepository: jest.fn(),
  };
  const topics = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    manager: { transaction: jest.fn(async (work) => work(manager)) },
  };
  const updates = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const appearances = { find: jest.fn(), exist: jest.fn() };
  const recurrence = { validate: jest.fn(), nextDueDate: jest.fn() };
  const scalars = {
    assertContentUser: jest.fn(),
    validateWrite: jest.fn(async (_manager, _user, context) => ({
      envelope: Buffer.from([context.fieldId]),
      commitRevision: "1",
      duplicate: false,
    })),
  };
  const viewer = { id: "user", role: "user" } as User;
  let service: TopicsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    topics.findOne.mockResolvedValue(undefined);
    updates.findOne.mockResolvedValue(undefined);
    scalars.validateWrite.mockImplementation(async (_manager, _user, context) => ({
      envelope: Buffer.from([context.fieldId]),
      commitRevision: "1",
      duplicate: false,
    }));
    const module = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
        { provide: RecurrenceService, useValue: recurrence },
        { provide: E2eeScalarService, useValue: scalars },
      ],
    }).compile();
    service = module.get(TopicsService);
    manager.getRepository.mockImplementation((entity) => entity === Topic
      ? topics
      : entity === TopicUpdate
        ? updates
        : appearances);
    appearances.find.mockResolvedValue([]);
    appearances.exist.mockResolvedValue(false);
  });

  const encryptedTopic = (values: Partial<Topic> = {}): Topic => ({
    id: "00000000-0000-4000-8000-000000000010",
    type: "generic",
    status: "open",
    nameEnvelope: Buffer.from([1]),
    nameCommitRevision: "1",
    descriptionEnvelope: Buffer.from([2]),
    descriptionCommitRevision: "1",
    membershipProcessStatusEnvelope: Buffer.from([3]),
    membershipProcessStatusCommitRevision: "1",
    godparentsEnvelope: Buffer.from([4]),
    godparentsCommitRevision: "1",
    membershipStatusSignal: null,
    followUpDate: null,
    responsibleUserId: null,
    defaultSectionId: null,
    defaultPosition: null,
    recurrenceFirstDueDate: null,
    recurrenceInterval: null,
    recurrenceUnit: null,
    createdAt: new Date("2026-08-10T10:00:00Z"),
    updatedAt: new Date("2026-08-10T11:00:00Z"),
    ...values,
  } as Topic);

  it("returns narrow structural/account data and only explicit scalar envelopes", async () => {
    topics.find.mockResolvedValue([encryptedTopic()]);

    const result = await service.findAll({ status: "active", type: "generic" }, viewer);

    expect(topics.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: In(["open", "deferred"]), type: "generic" },
      relations: { responsibleUser: true, defaultSection: true },
    }));
    expect(result[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000010",
      protected: {
        nameEnvelope: "AQ",
        descriptionEnvelope: "Ag",
      },
    });
    expect(JSON.stringify(result[0])).not.toContain('"name":');
  });

  it("withholds all Protected ciphertext from Guest viewers", async () => {
    topics.find.mockResolvedValue([encryptedTopic()]);
    await expect(service.findAll({}, { role: "guest" } as User)).resolves.toEqual([
      expect.objectContaining({ protected: null }),
    ]);
  });

  it("returns only structural appearance navigation without snapshot or Meeting text", async () => {
    topics.findOne.mockResolvedValue(encryptedTopic());
    appearances.find.mockResolvedValue([{
      id: "appearance",
      meetingId: "meeting",
      topicId: "00000000-0000-4000-8000-000000000010",
      sectionId: "section",
      position: 1,
      plannedDuration: 20,
      status: "planned",
      deferredAt: null,
      agendaNote: "must not leave the backend",
      topicNameSnapshotEnvelope: Buffer.from([1]),
      meeting: { id: "meeting", title: "Council", date: "2026-08-10", beginTime: "19:00", status: "completed" },
      section: { id: "section", name: "Main", position: 1 },
    }]);

    const result = await service.getAppearances(
      "00000000-0000-4000-8000-000000000010",
      { role: "admin" } as any,
    );
    expect(result).toEqual([expect.objectContaining({ id: "appearance", meetingId: "meeting" })]);
    expect(JSON.stringify(result)).not.toContain("agendaNote");
    expect(JSON.stringify(result)).not.toContain("SnapshotEnvelope");
  });

  it("persists four context-bound envelopes without accepting plaintext fields", async () => {
    const input = {
      id: "00000000-0000-4000-8000-000000000010",
      type: "generic",
      status: "open",
      protected: {
        nameEnvelope: "one",
        descriptionEnvelope: "two",
        membershipProcessStatusEnvelope: "three",
        godparentsEnvelope: "four",
      },
    } as any;

    await service.create(input, viewer);

    expect(scalars.validateWrite).toHaveBeenCalledTimes(4);
    expect(topics.create).toHaveBeenCalledWith(expect.objectContaining({
      nameEnvelope: Buffer.from([1]),
      descriptionEnvelope: Buffer.from([2]),
    }));
    expect(topics.create.mock.calls[0][0]).not.toHaveProperty("name");
  });

  it("returns an exact encrypted create retry without a second Topic insert", async () => {
    const existing = encryptedTopic();
    topics.findOne.mockResolvedValue(existing);
    scalars.validateWrite.mockImplementation(async (_manager, _user, context) => ({
      envelope: Buffer.from([context.fieldId]),
      commitRevision: "1",
      duplicate: true,
    }));
    const input = {
      id: existing.id,
      type: "generic",
      status: "open",
      protected: {
        nameEnvelope: "one",
        descriptionEnvelope: "two",
        membershipProcessStatusEnvelope: "three",
        godparentsEnvelope: "four",
      },
    } as any;

    await expect(service.create(input, viewer)).resolves.toMatchObject({ id: existing.id });
    expect(topics.save).not.toHaveBeenCalled();
  });

  it("returns an exact standalone Update retry without a second insert", async () => {
    topics.findOne.mockResolvedValue(encryptedTopic());
    updates.findOne.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000011",
      topicId: "00000000-0000-4000-8000-000000000010",
      type: "update",
      textEnvelope: Buffer.from([1]),
      textCommitRevision: "3",
    });
    scalars.validateWrite.mockResolvedValue({
      envelope: Buffer.from([1]),
      commitRevision: "3",
      duplicate: true,
    });

    await expect(service.addUpdate(
      "00000000-0000-4000-8000-000000000010",
      {
        id: "00000000-0000-4000-8000-000000000011",
        textEnvelope: "same",
      },
      viewer,
    )).resolves.toMatchObject({ id: "00000000-0000-4000-8000-000000000011" });
    expect(updates.save).not.toHaveBeenCalled();
  });

  it("preserves the Topic type lock after its first Meeting appearance", async () => {
    topics.findOne.mockResolvedValue(encryptedTopic({ type: "generic" }));
    appearances.exist.mockResolvedValue(true);

    await expect(service.update(
      "00000000-0000-4000-8000-000000000010",
      { type: "person" } as any,
      viewer,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TOPIC_TYPE_LOCKED" }),
    });
  });
});
