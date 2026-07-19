import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { In, LessThanOrEqual } from "typeorm";
import { MeetingsService } from "./meetings.service";

describe("MeetingsService", () => {
  const manager = {
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
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
  const snapshots = { apply: jest.fn() };
  const service = new MeetingsService(
    dataSource as any,
    meetings as any,
    participants as any,
    meetingTopics as any,
    topics as any,
    updates as any,
    tasks as any,
    sections as any,
    snapshots as any,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockReset();
    manager.create.mockReset();
    manager.find.mockReset();
    manager.findOne.mockReset();
    manager.findOneBy.mockReset();
    manager.delete.mockReset();
    snapshots.apply.mockReset();
    snapshots.apply.mockResolvedValue(undefined);
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

  it("lets the Meeting leader complete an in-progress Meeting atomically", async () => {
    const meeting = {
      id: "meeting",
      status: "in_progress",
      meetingLeaderId: "leader",
      minuteTakerId: "minute-taker",
    };
    const appearance = {
      id: "appearance",
      topic: {
        name: "Current topic name",
        responsibleUser: { firstName: "Ada", lastName: "Lovelace" },
      },
    };
    manager.findOne.mockResolvedValue(meeting);
    manager.find.mockResolvedValue([appearance]);

    await service.complete("meeting", { id: "leader" } as any);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(meeting.status).toBe("completed");
    expect(appearance).toMatchObject({
      topicNameSnapshot: "Current topic name",
      responsibleUserDisplayNameSnapshot: "Ada Lovelace",
    });
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), [appearance]);
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), meeting);
  });

  it("rejects completion by unrelated users and from any status except in-progress", async () => {
    manager.findOne.mockResolvedValue({
      id: "meeting",
      status: "in_progress",
      meetingLeaderId: "leader",
      minuteTakerId: "minute-taker",
    });
    await expect(service.complete("meeting", { id: "other" } as any)).rejects.toThrow(ForbiddenException);

    manager.findOne.mockResolvedValue({
      id: "meeting",
      status: "completed",
      meetingLeaderId: "leader",
      minuteTakerId: null,
    });
    await expect(service.complete("meeting", { id: "leader" } as any)).rejects.toThrow(ConflictException);
  });

  it("collects type-specific snapshots inside the centralized completion transaction", async () => {
    const extensibleSnapshots = {
      apply: jest.fn(async (appearance) => {
        Object.assign(appearance, { membershipProcessStatusSnapshot: "Nearly ready" });
      }),
    };
    const extensibleService = new MeetingsService(
      dataSource as any,
      meetings as any,
      participants as any,
      meetingTopics as any,
      topics as any,
      updates as any,
      tasks as any,
      sections as any,
      extensibleSnapshots as any,
    );
    const meeting = {
      id: "meeting",
      status: "in_progress",
      meetingLeaderId: "leader",
      minuteTakerId: null,
    };
    const appearance = {
      id: "appearance",
      topic: { name: "Membership", responsibleUser: null },
    };
    manager.findOne.mockResolvedValue(meeting);
    manager.find.mockResolvedValue([appearance]);

    await extensibleService.complete("meeting", { id: "leader" } as any);

    expect(extensibleSnapshots.apply).toHaveBeenCalledWith(appearance, appearance.topic, manager);
    expect(appearance).toMatchObject({
      responsibleUserDisplayNameSnapshot: null,
      membershipProcessStatusSnapshot: "Nearly ready",
    });
  });

  it.each([
    ["Meeting details", () => service.update("meeting", { status: "completed" } as any)],
    ["participants", () => service.addParticipant("meeting", { userId: "user", attendanceStatus: "present" })],
    ["participant removal", () => service.removeParticipant("meeting", "user")],
    ["agenda membership", () => service.addTopic("meeting", { topicId: "topic", sectionId: "section" } as any)],
    ["agenda ordering", () => service.reorderTopics("meeting", [])],
    ["agenda values", () => service.updateTopic("meeting", "appearance", { agendaNote: "changed" } as any)],
    ["agenda removal", () => service.removeTopic("meeting", "appearance")],
  ])("rejects changes to completed %s with a stable error", async (_label, mutate) => {
    manager.findOne.mockResolvedValue({ id: "meeting", status: "completed" });

    await expect(mutate()).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEETING_COMPLETED_IMMUTABLE" }),
    });
  });

  it("rejects bypassing the completion lifecycle through the general Meeting update", async () => {
    manager.findOne.mockResolvedValue({ id: "meeting", status: "in_progress" });

    await expect(service.update("meeting", { status: "completed" } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEETING_STATUS_TRANSITION_INVALID" }),
    });
  });
  it("updates known meetings and rejects missing ones", async () => {
    const meeting = { id: "meeting", title: "Old" };
    manager.findOne.mockResolvedValue(meeting);
    await expect(
      service.update("meeting", { title: "New" } as any),
    ).resolves.toMatchObject({ title: "New" });
    manager.findOne.mockResolvedValue(null);
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

  it("renders completed Meeting appearances from snapshots instead of live Topic display values", async () => {
    const appearance: any = {
      id: "appearance",
      topicId: "topic",
      topicNameSnapshot: "Recorded name",
      responsibleUserDisplayNameSnapshot: "Recorded Owner",
      topic: {
        name: "Later live name",
        responsibleUser: { firstName: "Later", lastName: "Owner" },
      },
    };
    meetings.findOne.mockResolvedValue({ id: "meeting", status: "completed" });
    participants.find.mockResolvedValue([]);
    meetingTopics.find.mockResolvedValue([appearance]);
    updates.find.mockResolvedValue([]);
    tasks.find.mockResolvedValue([]);

    const result = await service.findOne("meeting");

    expect(result.agenda[0].topic).toMatchObject({ name: "Recorded name" });
    expect(result.agenda[0].topic?.responsibleUser).toBeNull();
    expect(result.agenda[0].responsibleUserDisplayNameSnapshot).toBe("Recorded Owner");
  });

  it("returns only this Meeting's Minutes entries for a completed Meeting while retaining open tasks", async () => {
    const appearance: any = {
      id: "appearance",
      topicId: "topic",
      topicNameSnapshot: "Recorded name",
      topic: { name: "Live name" },
    };
    const ownMinute = { id: "own-minute", topicId: "topic", meetingId: "meeting", type: "minute" };
    const laterStandaloneUpdate = { id: "later-update", topicId: "topic", meetingId: null, type: "update" };
    const otherMeetingMinute = { id: "other-minute", topicId: "topic", meetingId: "other-meeting", type: "minute" };
    const openTask = { id: "open-task", topicId: "topic" };
    meetings.findOne.mockResolvedValue({ id: "meeting", status: "completed" });
    participants.find.mockResolvedValue([]);
    meetingTopics.find.mockResolvedValue([appearance]);
    updates.find.mockResolvedValue([laterStandaloneUpdate, otherMeetingMinute, ownMinute]);
    tasks.find.mockResolvedValue([openTask]);

    const result = await service.findOne("meeting");

    expect((result.agenda[0].topic as any).updates).toEqual([ownMinute]);
    expect((result.agenda[0].topic as any).tasks).toEqual([openTask]);
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
      where: { type: "recurring", status: "open" },
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
  it("rejects creating a Meeting directly in the completed state", async () => {
    await expect(service.create({ status: "completed" } as any)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "MEETING_STATUS_TRANSITION_INVALID" }),
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
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
    manager.findOne.mockImplementation(async (type: any) => type.name === "Meeting"
      ? { id: "meeting", status: "planned" }
      : { id: "topic" });
    manager.findOneBy.mockResolvedValue(null);
    await service.addParticipant("meeting", {
      userId: "user",
      attendanceStatus: "present",
    });
    expect(manager.create).toHaveBeenCalledWith(expect.anything(), {
      meetingId: "meeting",
      userId: "user",
      attendanceStatus: "present",
    });
    manager.findOneBy.mockResolvedValue({ attendanceStatus: "absent" });
    await service.addParticipant("meeting", {
      userId: "user",
      attendanceStatus: "present",
    });
    await service.removeParticipant("meeting", "user");
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), {
      meetingId: "meeting",
      userId: "user",
    });
    manager.findOneBy.mockImplementation(async (type: any) => {
      if (type.name === "AgendaSection") return { id: "section" };
      return null;
    });
    manager.find.mockResolvedValue([{ position: 2 }]);
    await expect(
      service.addTopic("meeting", {
        topicId: "topic",
        sectionId: "section",
      } as any),
    ).resolves.toMatchObject({ position: 3, status: "planned" });
    manager.find.mockResolvedValue([]);
    await expect(
      service.addTopic("meeting", {
        topicId: "topic-two",
        sectionId: "section",
      } as any),
    ).resolves.toMatchObject({ position: 1 });
    manager.findOneBy.mockImplementation(async (type: any) => {
      if (type.name === "AgendaSection") return { id: "section" };
      return {};
    });
    await expect(
      service.addTopic("meeting", {
        topicId: "topic",
        sectionId: "section",
      } as any),
    ).rejects.toThrow(ConflictException);
  });
  it("inserts an explicitly positioned topic transactionally and shifts later rows", async () => {
    manager.findOne.mockImplementation(async (type: any) => type.name === "Meeting"
      ? { id: "meeting", status: "planned" }
      : { id: "new" });
    manager.findOneBy.mockImplementation(async (type: any) => {
      if (type.name === "AgendaSection") return { id: "section" };
      return null;
    });
    const later = { id: "later", meetingId: "meeting", sectionId: "section", position: 2, status: "planned" };
    manager.find.mockResolvedValue([later]);
    manager.save.mockImplementation(async (_type: any, value: any) => value);
    manager.create.mockImplementation((_type: any, value: any) => value);
    await expect(service.addTopic("meeting", { topicId: "new", sectionId: "section", position: 2 } as any))
      .resolves.toMatchObject({ position: 2, status: "planned" });
    expect(later.position).toBe(3);
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), [later]);
    expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), {
      where: { id: "new" },
      lock: { mode: "pessimistic_write" },
    });
  });
  it("rejects invalid explicit positions and preserves duplicate-topic conflicts", async () => {
    manager.findOne.mockImplementation(async (type: any) => type.name === "Meeting"
      ? { id: "meeting", status: "planned" }
      : { id: "new" });
    manager.findOneBy.mockImplementation(async (type: any) => {
      if (type.name === "AgendaSection") return { id: "section" };
      return null;
    });
    manager.find.mockResolvedValue([]);
    await expect(service.addTopic("meeting", { topicId: "new", sectionId: "section", position: 2 } as any))
      .rejects.toThrow(BadRequestException);
    manager.findOneBy.mockImplementation(async (type: any) => {
      if (type.name === "AgendaSection") return { id: "section" };
      return { id: "present" };
    });
    await expect(service.addTopic("meeting", { topicId: "new", sectionId: "section", position: 1 } as any))
      .rejects.toThrow(ConflictException);
  });
  it("reorders a complete agenda transactionally while preserving unrelated fields", async () => {
    const one: any = { id: "one", meetingId: "meeting", sectionId: "first", position: 1, topicId: "topic-one", status: "done", agendaNote: "keep" };
    const two: any = { id: "two", meetingId: "meeting", sectionId: "second", position: 1, topicId: "topic-two", plannedDuration: 15 };
    manager.findOne.mockResolvedValue({ id: "meeting", status: "planned" });
    manager.find.mockResolvedValueOnce([one, two]).mockResolvedValueOnce([{ id: "second" }]);
    manager.save.mockImplementation(async (_type: any, value: any) => value);
    await expect(service.reorderTopics("meeting", [
      { id: "one", sectionId: "second", position: 1 },
      { id: "two", sectionId: "second", position: 2 },
    ])).resolves.toHaveLength(2);
    expect(one).toMatchObject({ sectionId: "second", position: 1, status: "done", agendaNote: "keep" });
    expect(two).toMatchObject({ sectionId: "second", position: 2, plannedDuration: 15 });
  });
  it("rejects duplicate, incomplete, and non-consecutive reorder payloads", async () => {
    manager.findOne.mockResolvedValue({ id: "meeting", status: "planned" });
    await expect(service.reorderTopics("meeting", [
      { id: "same", sectionId: "section", position: 1 },
      { id: "same", sectionId: "section", position: 2 },
    ])).rejects.toThrow(BadRequestException);
    manager.find.mockResolvedValue([{ id: "one", meetingId: "meeting" }, { id: "two", meetingId: "meeting" }]);
    await expect(service.reorderTopics("meeting", [{ id: "one", sectionId: "section", position: 1 }]))
      .rejects.toThrow(ConflictException);
    manager.find.mockResolvedValue([{ id: "one", meetingId: "meeting" }]);
    await expect(service.reorderTopics("meeting", [{ id: "one", sectionId: "section", position: 2 }]))
      .rejects.toThrow(BadRequestException);
  });
  it("updates/removes meeting-scoped agenda items and suggests eligible topics", async () => {
    manager.findOne.mockResolvedValue({ id: "meeting", status: "planned" });
    manager.findOneBy.mockResolvedValue({ id: "item" });
    await expect(
      service.updateTopic("meeting", "item", { position: 2 } as any),
    ).resolves.toMatchObject({ position: 2 });
    manager.findOneBy.mockResolvedValue(null);
    await expect(
      service.updateTopic("meeting", "item", {} as any),
    ).rejects.toThrow(NotFoundException);
    await service.removeTopic("meeting", "item");
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), {
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
