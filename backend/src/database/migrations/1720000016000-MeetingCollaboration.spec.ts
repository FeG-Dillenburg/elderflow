import { MeetingCollaboration1720000016000 } from "./1720000016000-MeetingCollaboration";

describe("Meeting collaboration migration", () => {
  it("adds hashed, expiring, single-use tickets without changing Meeting ciphertext", async () => {
    const statements: string[] = [];
    await new MeetingCollaboration1720000016000().up({
      query: jest.fn(async (sql: string) => { statements.push(sql); }),
    } as never);

    expect(statements.join("\n")).toContain('"ticket_hash" bytea PRIMARY KEY');
    expect(statements.join("\n")).toContain('"expires_at" timestamptz NOT NULL');
    expect(statements.join("\n")).toContain('"used_at" timestamptz');
    expect(statements.join("\n")).not.toMatch(/ALTER TABLE "meeting_documents"/);
  });

  it("is forward-only", async () => {
    await expect(new MeetingCollaboration1720000016000().down())
      .rejects.toThrow("E2EE_COLLABORATION_MIGRATION_IRREVERSIBLE");
  });
});
