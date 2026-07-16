import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { IsNull } from "typeorm";
import { DevelopmentIdentityGuard } from "./development-identity.guard";

describe("DevelopmentIdentityGuard", () => {
  const config = { get: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const users = { findOne: jest.fn() };
  const guard = new DevelopmentIdentityGuard(
    config as any,
    reflector as any,
    users as any,
  );
  const context = (method = "GET") => {
    const request: any = { method };
    return {
      request,
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  };
  beforeEach(() => jest.clearAllMocks());
  const environment = (
    value: string | undefined,
    email = "ADMIN@EXAMPLE.COM",
  ) =>
    config.get.mockImplementation((key: string) =>
      key === "NODE_ENV" ? value : email,
    );

  it("bypasses a public handler without identity lookup", async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(users.findOne).not.toHaveBeenCalled();
  });
  it.each(["production", "staging", undefined])(
    "rejects %s environment",
    async (value) => {
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      environment(value);
      await expect(guard.canActivate(context())).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );
  it("rejects missing configured email and unknown users", async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false);
    config.get.mockImplementation((key: string) =>
      key === "NODE_ENV" ? "development" : undefined,
    );
    await expect(guard.canActivate(context())).rejects.toThrow(
      "DEV_USER_EMAIL",
    );
    reflector.getAllAndOverride.mockReset().mockReturnValue(false);
    environment("development");
    users.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(context())).rejects.toThrow(
      "does not exist",
    );
  });
  it.each(["development", "test"])(
    "attaches a normalized simulated identity in %s",
    async (env) => {
      reflector.getAllAndOverride.mockReturnValue(false);
      environment(env);
      const requestContext = context();
      const user = { id: "user", role: "admin" };
      users.findOne.mockResolvedValue(user);
      await expect(guard.canActivate(requestContext)).resolves.toBe(true);
      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: "admin@example.com", archivedAt: IsNull() },
      });
      expect(requestContext.request.user).toBe(user);
    },
  );
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects viewer %s access",
    async (method) => {
      reflector.getAllAndOverride.mockReturnValue(false);
      environment("test");
      users.findOne.mockResolvedValue({ role: "viewer" });
      await expect(guard.canActivate(context(method))).rejects.toThrow(
        ForbiddenException,
      );
    },
  );
  it("allows viewer GET and enforces role metadata", async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);
    environment("test");
    users.findOne.mockResolvedValue({ role: "viewer" });
    await expect(guard.canActivate(context())).resolves.toBe(true);
    reflector.getAllAndOverride
      .mockReset()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(["admin"]);
    users.findOne.mockResolvedValue({ role: "leadership" });
    await expect(guard.canActivate(context())).rejects.toThrow(
      ForbiddenException,
    );
  });
  it("allows a user whose role is explicitly required", async () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(["leadership"]);
    environment("development");
    users.findOne.mockResolvedValue({ role: "leadership" });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
});
