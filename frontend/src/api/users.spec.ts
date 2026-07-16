import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser, getUsers, removeUser, restoreUser } from "./users";

const response = (body: unknown, ok = true) =>
  ({ ok, json: vi.fn().mockResolvedValue(body) }) as unknown as Response;
describe("users API client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("lists users and creates a user with its supplied payload", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);
    await getUsers();
    await createUser({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(
      fetch.mock.calls.map((call) => [call[0], call[1]?.method, call[1]?.body]),
    ).toEqual([
      ["http://localhost:3000/api/users", undefined, undefined],
      [
        "http://localhost:3000/api/user",
        "POST",
        JSON.stringify({
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        }),
      ],
    ]);
  });
  it("includes archived users and sends remove and restore requests", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    vi.stubGlobal("fetch", fetch);

    await getUsers(true);
    await removeUser("user-id");
    await restoreUser("user-id");

    expect(fetch.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["http://localhost:3000/api/users?includeArchived=true", undefined],
      ["http://localhost:3000/api/users/user-id", "DELETE"],
      ["http://localhost:3000/api/users/user-id/restore", "PATCH"],
    ]);
  });
  it("reports string, array, and fallback failures", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(response({ message: "Duplicate" }, false));
    await expect(getUsers()).rejects.toThrow("Duplicate");
    fetch.mockResolvedValueOnce(
      response({ message: ["Invalid email", "Required"] }, false),
    );
    await expect(getUsers()).rejects.toThrow("Invalid email, Required");
    fetch.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error()),
    });
    await expect(getUsers()).rejects.toThrow(
      "The request could not be completed",
    );
  });
});
