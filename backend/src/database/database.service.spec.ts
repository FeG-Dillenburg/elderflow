import { DatabaseService } from "./database.service";
describe("DatabaseService", () => {
  it.each([true, false])(
    "reflects DataSource initialization: %s",
    (isInitialized) =>
      expect(new DatabaseService({ isInitialized } as any).isConnected()).toBe(
        isInitialized,
      ),
  );
});
