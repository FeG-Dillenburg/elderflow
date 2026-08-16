import { MeetingCompletionTimestamp1720000015000 } from "./1720000015000-MeetingCompletionTimestamp";

describe("Meeting completion timestamp migration", () => {
  it("adds a nullable completion timestamp and backfills completed Meetings from their last update", async () => {
    const query = jest.fn();

    await new MeetingCompletionTimestamp1720000015000().up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain('ADD COLUMN "completed_at" timestamptz');
    expect(sql).toContain('SET "completed_at" = "updated_at"');
    expect(sql).toContain('WHERE "status" = \'completed\'');
  });
});
