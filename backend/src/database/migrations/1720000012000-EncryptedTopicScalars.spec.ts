import { EncryptedTopicScalars1720000012000 } from "./1720000012000-EncryptedTopicScalars";

describe("encrypted Topic scalar migration", () => {
  it("requires a prior explicit Topic reset and removes every replaced plaintext column", async () => {
    const query = jest.fn().mockResolvedValueOnce([{ has_protected_topic_data: false }]);

    await new EncryptedTopicScalars1720000012000().up({ query } as any);

    const statements = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(statements).toContain('SELECT EXISTS');
    expect(statements).toContain('FROM "topics"');
    expect(statements).not.toContain('FROM "meetings"');
    expect(statements).not.toContain('FROM "tasks"');
    expect(statements).not.toContain('TRUNCATE TABLE');
    expect(statements).toContain('DROP COLUMN "name"');
    expect(statements).toContain('DROP COLUMN "description"');
    expect(statements).toContain('DROP COLUMN "membership_process_status"');
    expect(statements).toContain('DROP COLUMN "godparents"');
    expect(statements).toContain('DROP COLUMN "text"');
    expect(statements).toContain('DROP COLUMN "topic_name_snapshot"');
    expect(statements).toContain('DROP COLUMN "membership_process_status_snapshot"');
    expect(statements).toContain('DROP COLUMN "godparents_snapshot"');
    expect(statements).toContain('ADD COLUMN "name_envelope" bytea NOT NULL');
    expect(statements).toContain('ADD COLUMN "topic_name_snapshot_envelope" bytea');
    expect(statements).toContain('CREATE TABLE "e2ee_scalar_writes"');
  });

  it("refuses to destroy pre-E2EE domain data or restore plaintext storage", async () => {
    const migration = new EncryptedTopicScalars1720000012000();
    const query = jest.fn().mockResolvedValueOnce([{ has_protected_topic_data: true }]);

    await expect(migration.up({ query } as any)).rejects.toThrow("E2EE_TOPIC_RESET_REQUIRED");
    expect(query).toHaveBeenCalledTimes(1);
    await expect(migration.down({ query } as any)).rejects.toThrow(
      "E2EE_TOPIC_MIGRATION_IRREVERSIBLE",
    );
  });
});
