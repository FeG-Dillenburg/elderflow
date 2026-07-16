import { getRepositoryToken } from "@nestjs/typeorm";
import { Test } from "@nestjs/testing";
import { DataSource, IsNull, Repository } from "typeorm";
import { QueryFailedError } from "typeorm";
import { ConflictException } from "@nestjs/common";
import { User } from "./user.entity";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let service: UsersService;
  let repository: jest.Mocked<
    Pick<Repository<User>, "create" | "find" | "findOneBy" | "save">
  >;
  let manager: {
    findOne: jest.Mock;
    query: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
    };
    manager = {
      findOne: jest.fn(),
      query: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it("returns users ordered by newest first", async () => {
    const users = [{ id: "user-id", email: "alex@example.com" }] as User[];
    repository.find.mockResolvedValue(users);

    await expect(service.findAll()).resolves.toEqual(users);
    expect(repository.find).toHaveBeenCalledWith({
      where: { archivedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  });

  it("includes archived users when requested", async () => {
    repository.find.mockResolvedValue([]);

    await service.findAll(true);

    expect(repository.find).toHaveBeenCalledWith({
      order: { createdAt: "DESC" },
    });
  });

  it("creates and saves a user", async () => {
    const input = {
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Smith",
      role: "user" as const,
      password: "password123!",
    };
    const user = { id: "user-id", email: input.email, firstName: input.firstName, lastName: input.lastName, role: input.role } as User;
    repository.create.mockReturnValue(user);
    repository.save.mockResolvedValue(user);

    await expect(service.create(input)).resolves.toEqual(user);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      passwordHash: expect.any(String),
    }));
    expect(repository.save).toHaveBeenCalledWith(user);
  });

  it("translates a PostgreSQL duplicate-email error", async () => {
    const input = {
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Smith",
      role: "user" as const,
      password: "password123!",
    };
    repository.create.mockReturnValue(input as unknown as User);
    const error = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error(), { code: "23505" }),
    );
    repository.save.mockRejectedValue(error);
    await expect(service.create(input)).rejects.toEqual(
      new ConflictException("A user with this email already exists"),
    );
  });

  it("rethrows non-duplicate TypeORM and ordinary errors unchanged", async () => {
    const input = {
      email: "alex@example.com",
      firstName: "Alex",
      lastName: "Smith",
      role: "user" as const,
      password: "password123!",
    };
    repository.create.mockReturnValue(input as unknown as User);
    for (const error of [
      new QueryFailedError(
        "INSERT",
        [],
        Object.assign(new Error(), { code: "99999" }),
      ),
      new Error("network"),
    ]) {
      repository.save.mockRejectedValue(error);
      await expect(service.create(input)).rejects.toBe(error);
    }
  });

  it("deletes a user that has no attached records", async () => {
    const user = { id: "user-id", archivedAt: null } as User;
    manager.findOne.mockResolvedValue(user);
    manager.query.mockResolvedValue([{ referenced: false }]);

    await expect(service.remove(user.id)).resolves.toEqual({ action: "deleted" });

    expect(manager.findOne).toHaveBeenCalledWith(User, {
      where: { id: user.id },
      lock: { mode: "pessimistic_write" },
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "meeting_users"'),
      [user.id],
    );
    expect(manager.delete).toHaveBeenCalledWith(User, user.id);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("archives a user that has attached records", async () => {
    const user = { id: "user-id", archivedAt: null } as User;
    manager.findOne.mockResolvedValue(user);
    manager.query.mockResolvedValue([{ referenced: true }]);

    await expect(service.remove(user.id)).resolves.toEqual({ action: "archived" });

    expect(user.archivedAt).toBeInstanceOf(Date);
    expect(manager.save).toHaveBeenCalledWith(User, user);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it("rejects removal and restoration of unknown users", async () => {
    manager.findOne.mockResolvedValue(null);
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.remove("missing")).rejects.toThrow("User not found");
    await expect(service.restore("missing")).rejects.toThrow("User not found");
  });

  it("restores an archived user", async () => {
    const user = { id: "user-id", archivedAt: new Date() } as User;
    repository.findOneBy.mockResolvedValue(user);
    repository.save.mockResolvedValue(user);

    await expect(service.restore(user.id)).resolves.toBe(user);

    expect(user.archivedAt).toBeNull();
    expect(repository.save).toHaveBeenCalledWith(user);
  });
});
