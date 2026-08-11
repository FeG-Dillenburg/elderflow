import { In, LessThan, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  const meetings = { findOne: jest.fn() };
  const tasks = { find: jest.fn() };
  const topics = { find: jest.fn() };
  const service = new DashboardService(
    meetings as any,
    tasks as any,
    topics as any,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-15T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());
  it("runs all dashboard queries and maps each response", async () => {
    const next = {
      id: "meeting",
      title: "must-not-leak",
      date: "2026-07-20",
      beginTime: "19:30",
      status: "planned",
      meetingLeaderId: null,
      meetingLeader: null,
      generalNotes: "must-not-leak",
    };
    const mine = [{
      id: "mine",
      titleEnvelope: Buffer.from("mine"),
      descriptionEnvelope: Buffer.from("description"),
    }];
    const overdue = [{
      id: "late",
      titleEnvelope: Buffer.from("late"),
      descriptionEnvelope: Buffer.from("description"),
    }];
    const followUps = [{
      id: "follow",
      nameEnvelope: Buffer.from("follow"),
      descriptionEnvelope: Buffer.from("must-not-leak"),
    }];
    const recent = [{
      id: "recent",
      nameEnvelope: Buffer.from("recent"),
      descriptionEnvelope: Buffer.from("must-not-leak"),
    }];
    meetings.findOne.mockResolvedValue(next);
    tasks.find.mockResolvedValueOnce(mine).mockResolvedValueOnce(overdue);
    topics.find.mockResolvedValueOnce(followUps).mockResolvedValueOnce(recent);
    const result = await service.get({ id: "user", role: "user" } as any);
    expect(result).toMatchObject({
      nextMeeting: expect.objectContaining({ id: "meeting", date: "2026-07-20" }),
      myOpenTasks: [expect.objectContaining({ id: "mine" })],
      overdueTasks: [expect.objectContaining({ id: "late" })],
      followUpTopics: [expect.objectContaining({
        id: "follow",
        protected: expect.objectContaining({ nameEnvelope: expect.any(String) }),
      })],
      recentTopics: [expect.objectContaining({
        id: "recent",
        protected: expect.objectContaining({ nameEnvelope: expect.any(String) }),
      })],
    });
    expect(result.nextMeeting).not.toHaveProperty("title");
    expect(result.nextMeeting).not.toHaveProperty("generalNotes");
    expect(result.myOpenTasks[0].protected).toEqual({
      titleEnvelope: Buffer.from("mine").toString("base64url"),
      titleCommitRevision: undefined,
    });
    expect(result.myOpenTasks[0].protected).not.toHaveProperty("descriptionEnvelope");
    expect(result.followUpTopics[0].protected).toEqual({
      nameEnvelope: Buffer.from("follow").toString("base64url"),
      nameCommitRevision: undefined,
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(meetings.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { date: MoreThanOrEqual("2026-07-15"), status: "planned" },
      relations: { meetingLeader: true },
      order: { date: "ASC" },
      select: expect.objectContaining({ id: true, date: true }),
    }));
    expect(meetings.findOne.mock.calls[0][0].select).not.toHaveProperty("title");
    expect(tasks.find).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { assignedToId: "user", status: In(["open", "in_progress"]) },
      order: { dueDate: "ASC" },
      take: 8,
      select: expect.objectContaining({ titleEnvelope: true }),
    }));
    expect(tasks.find.mock.calls[0][0].select).not.toHaveProperty("descriptionEnvelope");
    expect(tasks.find).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        dueDate: LessThan("2026-07-15"),
        status: In(["open", "in_progress"]),
      },
      relations: { assignedTo: true },
      order: { dueDate: "ASC" },
      take: 8,
    }));
    expect(topics.find).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        followUpDate: LessThanOrEqual("2026-07-15"),
        status: In(["open", "deferred"]),
      },
      relations: { responsibleUser: true },
      order: { followUpDate: "ASC" },
      take: 8,
    }));
    expect(topics.find).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { status: In(["open", "deferred"]) },
      relations: { responsibleUser: true },
      order: { updatedAt: "DESC" },
      take: 8,
    }));
  });
  it("preserves null and empty query results", async () => {
    meetings.findOne.mockResolvedValue(null);
    tasks.find.mockResolvedValue([]);
    topics.find.mockResolvedValue([]);
    await expect(service.get({ id: "user", role: "user" } as any)).resolves.toEqual({
      nextMeeting: null,
      myOpenTasks: [],
      overdueTasks: [],
      followUpTopics: [],
      recentTopics: [],
    });
  });

  it("withholds all dashboard Protected ciphertext from Guest viewers", async () => {
    const topic = {
      id: "topic",
      nameEnvelope: Buffer.from([1]),
      descriptionEnvelope: Buffer.from([2]),
      membershipProcessStatusEnvelope: Buffer.from([3]),
      godparentsEnvelope: Buffer.from([4]),
    };
    meetings.findOne.mockResolvedValue(null);
    tasks.find.mockResolvedValue([{
      id: "task",
      titleEnvelope: Buffer.from("task-title"),
      descriptionEnvelope: Buffer.from("task-description"),
    }]);
    topics.find.mockResolvedValue([topic]);

    const result = await service.get({ id: "guest", role: "guest" } as any);
    expect(result.followUpTopics[0]).toMatchObject({ id: "topic", protected: null });
    expect(result.myOpenTasks[0]).toMatchObject({ id: "task", protected: null });
    expect(JSON.stringify(result)).not.toContain("nameEnvelope");
  });
});
