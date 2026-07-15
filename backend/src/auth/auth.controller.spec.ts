import { AuthController } from "./auth.controller";
describe("AuthController", () => {
  it("returns the supplied user unchanged", () => {
    const user = { id: "user" } as any;
    expect(new AuthController().me(user)).toBe(user);
  });
});
