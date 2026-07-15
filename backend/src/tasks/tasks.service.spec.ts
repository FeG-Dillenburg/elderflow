import { NotFoundException } from "@nestjs/common";
import { In, LessThan, LessThanOrEqual } from "typeorm";
import { Task } from "./task.entity";
import { TasksService } from "./tasks.service";

describe("TasksService", () => {
  const repository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
  };
  const service = new TasksService(repository as any);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-15T10:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it.each([undefined, "open"])(
    "uses active task statuses for %s",
    async (status) => {
      repository.find.mockResolvedValue([]);
      await service.findAll({ status });
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: In(["open", "in_progress"]),
          }),
          relations: { topic: true, meeting: true, assignedTo: true },
          order: { dueDate: "ASC", createdAt: "DESC" },
        }),
      );
    },
  );

  it("applies supplied filters and due-on date", async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll({
      status: "done",
      assignedToId: "user",
      topicId: "topic",
      meetingId: "meeting",
      dueOn: "2026-07-20",
    });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "done",
          assignedToId: "user",
          topicId: "topic",
          meetingId: "meeting",
          dueDate: LessThanOrEqual("2026-07-20"),
        },
      }),
    );
  });

  it("uses strict today comparison for overdue and gives it precedence", async () => {
    repository.find.mockResolvedValue([]);
    await service.findAll({ overdue: true, dueOn: "2026-07-20" });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dueDate: LessThan("2026-07-15") }),
      }),
    );
  });

  it("creates and saves tasks", async () => {
    const task = { id: "task" } as Task;
    repository.create.mockReturnValue(task);
    repository.save.mockResolvedValue(task);
    await expect(service.create({ title: "Follow up" } as any)).resolves.toBe(
      task,
    );
    expect(repository.create).toHaveBeenCalledWith({ title: "Follow up" });
  });

  it("rejects a missing update target", async () => {
    repository.findOneBy.mockResolvedValue(null);
    await expect(service.update("missing", {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("sets, preserves, and clears completion timestamps based on status", async () => {
    const task = { id: "task", completedAt: null } as Task;
    repository.findOneBy.mockResolvedValue(task);
    repository.save.mockImplementation(async (v: Task) => v);
    const done = await service.update("task", { status: "done" } as any);
    expect(done.completedAt).toEqual(new Date("2026-07-15T10:00:00.000Z"));
    const timestamp = new Date("2020-01-01");
    task.completedAt = timestamp;
    await service.update("task", { status: "done" } as any);
    expect(task.completedAt).toBe(timestamp);
    await service.update("task", { status: "open" } as any);
    expect(task.completedAt).toBeNull();
  });
});
