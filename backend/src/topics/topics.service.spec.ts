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
  const topics = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const updates = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
  const appearances = { find: jest.fn() };
  let service: TopicsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
      ],
    }).compile();
    service = module.get(TopicsService);
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

  it("applies each topic filter with relations and order", async () => {
    topics.find.mockResolvedValue([]);
    await service.findAll({
      status: "active",
      type: "general",
      responsibleUserId: "user",
      defaultSectionId: "section",
      dueOn: "2026-07-20",
    });
    expect(topics.find).toHaveBeenCalledWith({
      where: {
        status: In(["open", "deferred"]),
        type: "general",
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
    await service.findAll({ type: "general" });
    expect(topics.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { type: "general" } }),
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
    await service.create({ name: "New" } as any);
    expect(topics.create).toHaveBeenCalledWith({ name: "New" });
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
});
