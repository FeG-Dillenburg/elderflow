import { getRepositoryToken } from "@nestjs/typeorm";
import { Test } from "@nestjs/testing";
import { MeetingTopic } from "../meetings/meeting-topic.entity";
import { User } from "../users/user.entity";
import { Topic } from "./topic.entity";
import { TopicUpdate } from "./topic-update.entity";
import { TopicsService } from "./topics.service";
import { NotFoundException } from "@nestjs/common";
import { In, LessThanOrEqual } from "typeorm";

describe("TopicsService", () => {
  const manager = {
    findOne: jest.fn(),
    getRepository: jest.fn(),
  };
  const topics = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const updates = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const appearances = { find: jest.fn(), exist: jest.fn() };
  let service: TopicsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
      ],
    }).compile();
    service = module.get(TopicsService);
    appearances.exist.mockResolvedValue(false);
    manager.findOne.mockResolvedValue(null);
    manager.getRepository.mockImplementation((entity: unknown) => entity === Topic
      ? topics
      : entity === TopicUpdate
        ? updates
        : appearances);
    topics.manager.transaction.mockImplementation(async (work) => work(manager));
  });

  it("links a new update to the topic and current user", async () => {
    const topic = { id: "topic-id" } as Topic;
    const user = { id: "user-id" } as User;
    const update = { id: "update-id" } as TopicUpdate;
    topics.findOne.mockResolvedValue(topic);
    updates.create.mockReturnValue(update);
    updates.save.mockResolvedValue(update);

    await expect(
      service.addUpdate(
        topic.id,
        { text: "<p>Decision</p>", type: "decision" },
        user,
      ),
    ).resolves.toBe(update);
    expect(updates.create).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: topic.id,
        createdById: user.id,
        text: "<p>Decision</p>",
        type: "decision",
      }),
    );
  });

  it("rejects a Minutes entry linked to a completed Meeting with a stable error", async () => {
    manager.findOne.mockResolvedValue({ id: "meeting", status: "completed" });

    await expect(service.addUpdate(
      "topic-id",
      { text: "Late change", type: "minute", meetingId: "meeting" },
      { id: "user-id" } as User,
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEETING_COMPLETED_IMMUTABLE" }),
    });
    expect(updates.save).not.toHaveBeenCalled();
  });

  it("applies each topic filter with relations and order", async () => {
    topics.find.mockResolvedValue([]);
    await service.findAll({
      status: "active",
      type: "generic",
      responsibleUserId: "user",
      defaultSectionId: "section",
      dueOn: "2026-07-20",
    });
    expect(topics.find).toHaveBeenCalledWith({
      where: {
        status: In(["open", "deferred"]),
        type: "generic",
        responsibleUserId: "user",
        defaultSectionId: "section",
        followUpDate: LessThanOrEqual("2026-07-20"),
      },
      relations: { responsibleUser: true, defaultSection: true },
      order: { updatedAt: "DESC" },
    });
  });

  it("passes non-active statuses through and allows each optional filter independently", async () => {
    topics.find.mockResolvedValue([]);
    await service.findAll({ status: "done" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { status: "done" } }),
    );
    await service.findAll({ type: "generic" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { type: "generic" } }),
    );
    await service.findAll({ responsibleUserId: "user" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { responsibleUserId: "user" } }),
    );
    await service.findAll({ defaultSectionId: "section" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { defaultSectionId: "section" } }),
    );
    await service.findAll({ dueOn: "2026-07-20" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { followUpDate: LessThanOrEqual("2026-07-20") },
      }),
    );
  });

  it("loads a topic or rejects missing topics", async () => {
    const topic = { id: "topic" } as Topic;
    topics.findOne.mockResolvedValue(topic);
    await expect(service.findOne("topic")).resolves.toBe(topic);
    expect(topics.findOne).toHaveBeenCalledWith({
      where: { id: "topic" },
      relations: { responsibleUser: true, defaultSection: true },
    });
    topics.findOne.mockResolvedValue(null);
    await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("creates, updates, and loads associated resources", async () => {
    const topic = { id: "topic", name: "Old" } as Topic;
    topics.create.mockReturnValue(topic);
    topics.save.mockImplementation(async (v: Topic) => v);
    topics.findOne.mockResolvedValue(topic);
    updates.find.mockResolvedValue([]);
    appearances.find.mockResolvedValue([]);
    await service.create({ name: "New", type: "generic" } as any);
    expect(topics.create).toHaveBeenCalledWith({ name: "New", type: "generic", isRecurring: false });
    await service.update("topic", { name: "New" });
    expect(topics.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New" }),
    );
    await service.getUpdates("topic");
    expect(updates.find).toHaveBeenCalledWith({
      where: { topicId: "topic" },
      relations: { createdBy: true, meeting: true },
      order: { date: "DESC" },
    });
    await service.getAppearances("topic");
    expect(appearances.find).toHaveBeenCalledWith({
      where: { topicId: "topic" },
      relations: { meeting: true, section: true },
      order: { meeting: { date: "DESC" } },
    });
  });

  it("timestamps a new update with the current user and date", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    const topic = { id: "topic" } as Topic;
    const update = { id: "update" } as TopicUpdate;
    topics.findOne.mockResolvedValue(topic);
    updates.create.mockReturnValue(update);
    updates.save.mockResolvedValue(update);
    await service.addUpdate("topic", { text: "Text", type: "minute" }, {
      id: "user",
    } as User);
    expect(updates.create).toHaveBeenCalledWith({
      text: "Text",
      type: "minute",
      topicId: "topic",
      createdById: "user",
      date: new Date("2026-07-15T12:00:00.000Z"),
    });
    jest.useRealTimers();
  });

  it("does not conceal repository failures", async () => {
    const failure = new Error("database unavailable");
    topics.find.mockRejectedValue(failure);
    await expect(service.findAll({})).rejects.toBe(failure);
  });

  it("creates a Generic Topic with an optional description", async () => {
    const input = {
      name: "Topic",
      description: null,
      type: "generic",
      status: "open",
      isRecurring: false,
    } as any;
    const topic = { id: "topic", ...input } as Topic;
    topics.create.mockReturnValue(topic);
    topics.save.mockResolvedValue(topic);

    await expect(service.create(input)).resolves.toBe(topic);
    expect(topics.create).toHaveBeenCalledWith(input);
  });

  it("rejects unsupported discriminator values with a stable code", async () => {
    await expect(service.create({ type: "general" } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "UNSUPPORTED_TOPIC_TYPE" }),
    });
  });

  it("creates a New membership Topic with the default signal", async () => {
    const input = {
      name: "Alex and Sam",
      type: "new_membership",
      status: "open",
      membershipProcessStatus: "Introductory visit",
      godparents: "Taylor and Robin",
    } as any;
    topics.create.mockImplementation((value: Topic) => value);
    topics.save.mockImplementation(async (value: Topic) => value);

    await expect(service.create(input)).resolves.toMatchObject({
      membershipStatusSignal: "new",
    });
    expect(topics.create).toHaveBeenCalledWith(expect.objectContaining({
      type: "new_membership",
      membershipStatusSignal: "new",
    }));
  });

  it("rejects membership fields on another Topic type with a stable code", async () => {
    await expect(service.create({
      name: "Budget",
      type: "generic",
      status: "open",
      membershipStatusSignal: "new",
    } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEMBERSHIP_FIELDS_PROHIBITED" }),
    });
  });

  it("rejects an invalid New membership signal with a stable code", async () => {
    await expect(service.create({
      name: "Alex",
      type: "new_membership",
      status: "open",
      membershipStatusSignal: "purple",
    } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEMBERSHIP_SIGNAL_INVALID" }),
    });
  });

  it("creates a Person Topic with only common Topic state", async () => {
    const input = {
      name: "Alex and Sam",
      description: "Pastoral context",
      type: "person",
      status: "open",
      responsibleUserId: "00000000-0000-4000-8000-000000000001",
    } as any;
    const topic = { id: "topic", ...input, isRecurring: false } as Topic;
    topics.create.mockReturnValue(topic);
    topics.save.mockResolvedValue(topic);

    await expect(service.create(input)).resolves.toBe(topic);
    expect(topics.create).toHaveBeenCalledWith({ ...input, isRecurring: false });
  });

  it("rejects a type change after the first Meeting appearance", async () => {
    topics.findOne.mockResolvedValue({ id: "topic", type: "person" } as Topic);
    appearances.exist.mockResolvedValue(true);

    await expect(service.update("topic", { type: "generic" })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TOPIC_TYPE_LOCKED" }),
    });
    expect(topics.save).not.toHaveBeenCalled();
    expect(topics.findOne).toHaveBeenCalledWith(expect.objectContaining({
      lock: { mode: "pessimistic_write", tables: ["topics"] },
    }));
  });

  it("converts a pre-history Topic atomically and clears legacy source-only state", async () => {
    const topic = {
      id: "topic",
      type: "recurring",
      isRecurring: true,
      name: "Old",
    } as Topic;
    topics.findOne.mockResolvedValue(topic);
    topics.save.mockImplementation(async (value: Topic) => value);

    await expect(service.update("topic", { type: "generic", name: "New" })).resolves.toMatchObject({
      type: "generic",
      isRecurring: false,
      name: "New",
    });
    expect(appearances.exist).toHaveBeenCalledWith({ where: { topicId: "topic" } });
    expect(topics.save).toHaveBeenCalledTimes(1);
  });

  it("clears New membership fields when a pre-history Topic changes type", async () => {
    topics.findOne.mockResolvedValue({
      id: "topic",
      type: "new_membership",
      membershipProcessStatus: "Visit booked",
      membershipStatusSignal: "in_progress",
      godparents: "Taylor",
    } as Topic);
    topics.save.mockImplementation(async (value: Topic) => value);

    await expect(service.update("topic", { type: "generic" })).resolves.toMatchObject({
      type: "generic",
      membershipProcessStatus: null,
      membershipStatusSignal: null,
      godparents: null,
    });
  });
});
