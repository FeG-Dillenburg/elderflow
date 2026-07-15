import { ConflictException, NotFoundException } from "@nestjs/common";
import { In, LessThanOrEqual } from "typeorm";
import { MeetingsService } from "./meetings.service";

describe("MeetingsService", () => {
  const manager = {
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const dataSource = { transaction: jest.fn((fn) => fn(manager)) };
  const meetings = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const participants = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const meetingTopics = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const topics = { find: jest.fn() };
  const updates = { find: jest.fn() };
  const tasks = { find: jest.fn() };
  const sections = {};
  const service = new MeetingsService(
    dataSource as any,
    meetings as any,
    participants as any,
    meetingTopics as any,
    topics as any,
    updates as any,
    tasks as any,
    sections as any,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockImplementation(async (_type, value) => value);
    manager.create.mockImplementation((_type, value) => value);
  });

  it("lists meetings with people and newest dates first", async () => {
    meetings.find.mockResolvedValue([]);
    await service.findAll();
    expect(meetings.find).toHaveBeenCalledWith({
      relations: { meetingLeader: true, minuteTaker: true },
      order: { date: "DESC" },
    });
  });
  it("updates known meetings and rejects missing ones", async () => {
    const meeting = { id: "meeting", title: "Old" };
    meetings.findOneBy.mockResolvedValue(meeting);
    meetings.save.mockImplementation(async (v) => v);
    await expect(
      service.update("meeting", { title: "New" } as any),
    ).resolves.toMatchObject({ title: "New" });
    meetings.findOneBy.mockResolvedValue(null);
    await expect(service.update("x", {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("loads detail, attaches only matching updates/tasks, and skips those queries for empty agenda", async () => {
    const agenda: any[] = [
      { id: "a", topicId: "one", topic: {} },
      { id: "b", topicId: "two", topic: {} },
    ];
    meetings.findOne.mockResolvedValue({ id: "meeting" });
    participants.find.mockResolvedValue([]);
    meetingTopics.find.mockResolvedValue(agenda);
    updates.find.mockResolvedValue([{ topicId: "one" }]);
    tasks.find.mockResolvedValue([{ topicId: "two" }]);
    const result = await service.findOne("meeting");
    const loadedAgenda = result.agenda as any[];
    expect(loadedAgenda[0].topic.updates).toHaveLength(1);
    expect(loadedAgenda[0].topic.tasks).toHaveLength(0);
    expect(loadedAgenda[1].topic.tasks).toHaveLength(1);
    expect(meetingTopics.find).toHaveBeenCalledWith({
      where: { meetingId: "meeting" },
      relations: { section: true, topic: { responsibleUser: true } },
      order: { section: { position: "ASC" }, position: "ASC" },
    });
    expect(updates.find).toHaveBeenCalledWith({
      where: { topicId: In(["one", "two"]) },
      relations: { createdBy: true, meeting: true },
      order: { date: "DESC" },
    });
    meetings.findOne.mockResolvedValue({ id: "empty" });
    meetingTopics.find.mockResolvedValue([]);
    await service.findOne("empty");
    expect(updates.find).toHaveBeenCalledTimes(1);
    expect(tasks.find).toHaveBeenCalledTimes(1);
  });

  it("rejects missing meetings when finding details", async () => {
    meetings.findOne.mockResolvedValue(null);
    await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
  });
  it("creates recurring agenda items using defaults, fallback, and one-based positions", async () => {
    manager.create.mockImplementation((_type, value) => value);
    manager.save.mockImplementation(async (_type, value) => ({
      id: value.id ?? "meeting",
      ...value,
    }));
    manager.find.mockResolvedValue([
      { id: "one", defaultSectionId: "section", defaultPosition: 4 },
      { id: "two", defaultSectionId: null, defaultPosition: null },
      { id: "skip", defaultSectionId: null, defaultPosition: null },
    ]);
    manager.findOne.mockResolvedValueOnce({ id: "fallback" });
    await expect(service.create({ title: null } as any)).resolves.toMatchObject(
      { id: "meeting" },
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.find).toHaveBeenCalledWith(expect.anything(), {
      where: { isRecurring: true, status: "open" },
      order: { defaultPosition: "ASC" },
    });
    expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), {
      where: { isDefault: true },
      order: { position: "ASC" },
    });
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topicId: "one",
        sectionId: "section",
        position: 4,
        status: "planned",
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topicId: "two",
        sectionId: "fallback",
        position: 2,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        topicId: "skip",
        sectionId: "fallback",
        position: 3,
      }),
    );
  });
  it("propagates transaction errors", async () => {
    dataSource.transaction.mockRejectedValueOnce(new Error("rollback"));
    await expect(service.create({} as any)).rejects.toThrow("rollback");
  });
  it("skips a recurring topic when neither its section nor a fallback exists", async () => {
    manager.find.mockResolvedValue([
      { id: "skip", defaultSectionId: null, defaultPosition: null },
    ]);
    manager.findOne.mockResolvedValue(null);
    await service.create({} as any);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it("creates/updates/removes participants and agenda topics scoped to the meeting", async () => {
    jest.spyOn(service, "findOne").mockResolvedValue({} as any);
    participants.findOneBy.mockResolvedValue(null);
    participants.create.mockImplementation((v) => v);
    participants.save.mockImplementation(async (v) => v);
    await service.addParticipant("meeting", {
      userId: "user",
      attendanceStatus: "present",
    });
    expect(participants.create).toHaveBeenCalledWith({
      meetingId: "meeting",
      userId: "user",
      attendanceStatus: "present",
    });
    participants.findOneBy.mockResolvedValue({ attendanceStatus: "absent" });
    await service.addParticipant("meeting", {
      userId: "user",
      attendanceStatus: "present",
    });
    expect(participants.delete).not.toHaveBeenCalled();
    await service.removeParticipant("meeting", "user");
    expect(participants.delete).toHaveBeenCalledWith({
      meetingId: "meeting",
      userId: "user",
    });
    meetingTopics.findOneBy.mockResolvedValue(null);
    meetingTopics.findOne.mockResolvedValue({ position: 2 });
    meetingTopics.create.mockImplementation((v) => v);
    meetingTopics.save.mockImplementation(async (v) => v);
    await expect(
      service.addTopic("meeting", {
        topicId: "topic",
        sectionId: "section",
      } as any),
    ).resolves.toMatchObject({ position: 3, status: "planned" });
    meetingTopics.findOne.mockResolvedValue(null);
    await expect(
      service.addTopic("meeting", {
        topicId: "topic-two",
        sectionId: "section",
      } as any),
    ).resolves.toMatchObject({ position: 1 });
    await expect(
      service.addTopic("meeting", {
        topicId: "topic-three",
        sectionId: "section",
        position: 9,
      } as any),
    ).resolves.toMatchObject({ position: 9 });
    meetingTopics.findOneBy.mockResolvedValue({});
    await expect(
      service.addTopic("meeting", {
        topicId: "topic",
        sectionId: "section",
      } as any),
    ).rejects.toThrow(ConflictException);
  });
  it("updates/removes meeting-scoped agenda items and suggests eligible topics", async () => {
    meetingTopics.findOneBy.mockResolvedValue({ id: "item" });
    meetingTopics.save.mockImplementation(async (v) => v);
    await expect(
      service.updateTopic("meeting", "item", { position: 2 } as any),
    ).resolves.toMatchObject({ position: 2 });
    meetingTopics.findOneBy.mockResolvedValue(null);
    await expect(
      service.updateTopic("meeting", "item", {} as any),
    ).rejects.toThrow(NotFoundException);
    await service.removeTopic("meeting", "item");
    expect(meetingTopics.delete).toHaveBeenCalledWith({
      id: "item",
      meetingId: "meeting",
    });
    meetings.findOneBy.mockResolvedValue({ date: "2026-07-20" });
    meetingTopics.find.mockResolvedValue([{ topicId: "present" }]);
    topics.find.mockResolvedValue([{ id: "present" }, { id: "suggest" }]);
    await expect(service.suggestions("meeting")).resolves.toEqual([
      { id: "suggest" },
    ]);
    expect(topics.find).toHaveBeenCalledWith({
      where: [
        { status: "open" },
        { status: "deferred", followUpDate: LessThanOrEqual("2026-07-20") },
      ],
      relations: { responsibleUser: true, defaultSection: true },
      order: { followUpDate: "ASC", updatedAt: "DESC" },
    });
    meetings.findOneBy.mockResolvedValue(null);
    await expect(service.suggestions("missing")).rejects.toThrow(
      NotFoundException,
    );
  });
});
