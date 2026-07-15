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
    const next = { id: "meeting" };
    const mine = [{ id: "mine" }];
    const overdue = [{ id: "late" }];
    const followUps = [{ id: "follow" }];
    const recent = [{ id: "recent" }];
    meetings.findOne.mockResolvedValue(next);
    tasks.find.mockResolvedValueOnce(mine).mockResolvedValueOnce(overdue);
    topics.find.mockResolvedValueOnce(followUps).mockResolvedValueOnce(recent);
    await expect(service.get({ id: "user" } as any)).resolves.toEqual({
      nextMeeting: next,
      myOpenTasks: mine,
      overdueTasks: overdue,
      followUpTopics: followUps,
      recentTopics: recent,
    });
    expect(meetings.findOne).toHaveBeenCalledWith({
      where: { date: MoreThanOrEqual("2026-07-15"), status: "planned" },
      relations: { meetingLeader: true, minuteTaker: true },
      order: { date: "ASC" },
    });
    expect(tasks.find).toHaveBeenNthCalledWith(1, {
      where: { assignedToId: "user", status: In(["open", "in_progress"]) },
      relations: { topic: true },
      order: { dueDate: "ASC" },
      take: 8,
    });
    expect(tasks.find).toHaveBeenNthCalledWith(2, {
      where: {
        dueDate: LessThan("2026-07-15"),
        status: In(["open", "in_progress"]),
      },
      relations: { topic: true, assignedTo: true },
      order: { dueDate: "ASC" },
      take: 8,
    });
    expect(topics.find).toHaveBeenNthCalledWith(1, {
      where: {
        followUpDate: LessThanOrEqual("2026-07-15"),
        status: In(["open", "deferred"]),
      },
      relations: { responsibleUser: true },
      order: { followUpDate: "ASC" },
      take: 8,
    });
    expect(topics.find).toHaveBeenNthCalledWith(2, {
      where: { status: In(["open", "deferred"]) },
      relations: { responsibleUser: true },
      order: { updatedAt: "DESC" },
      take: 8,
    });
  });
  it("preserves null and empty query results", async () => {
    meetings.findOne.mockResolvedValue(null);
    tasks.find.mockResolvedValue([]);
    topics.find.mockResolvedValue([]);
    await expect(service.get({ id: "user" } as any)).resolves.toEqual({
      nextMeeting: null,
      myOpenTasks: [],
      overdueTasks: [],
      followUpTopics: [],
      recentTopics: [],
    });
  });
});
