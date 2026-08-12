import { EncryptedMeetingWorkspaces1720000014000 } from "./1720000014000-EncryptedMeetingWorkspaces";

describe("encrypted Meeting workspace migration", () => {
  it("removes plaintext Meeting stores and creates bounded opaque persistence", async () => {
    const query = jest.fn().mockResolvedValueOnce([{ has_protected_meeting_data: false }]);

    await new EncryptedMeetingWorkspaces1720000014000().up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain('DROP COLUMN "title"');
    expect(sql).toContain('DROP COLUMN "general_notes"');
    expect(sql).toContain('DROP COLUMN "opening_input"');
    expect(sql).toContain('DROP COLUMN "agenda_note"');
    expect(sql).toContain('RENAME COLUMN "note_edited_at" TO "content_edited_at"');
    expect(sql).toContain('DROP COLUMN "meeting_text"');
    expect(sql).toContain('DROP COLUMN "meeting_id"');
    expect(sql).toContain('ADD COLUMN "title_envelope" bytea NOT NULL');
    expect(sql).toContain('CREATE TABLE "meeting_documents"');
    expect(sql).toContain('CREATE TABLE "meeting_document_snapshots"');
    expect(sql).toContain('CREATE TABLE "meeting_document_updates"');
    expect(sql).toContain('"source_appearance_id" uuid');
    expect(sql).toContain('"request_fingerprint" bytea NOT NULL');
    expect(sql).toContain('UNIQUE ("document_id", "client_epoch_id", "author_clock")');
    expect(sql).toContain('CHECK (octet_length("envelope") <= 1050000)');
    expect(sql).toContain('CHECK (octet_length("envelope") <= 16800000)');
  });

  it("requires the explicit reset and never restores plaintext", async () => {
    const migration = new EncryptedMeetingWorkspaces1720000014000();
    const query = jest.fn().mockResolvedValueOnce([{ has_protected_meeting_data: true }]);

    await expect(migration.up({ query } as never)).rejects.toThrow("E2EE_MEETING_RESET_REQUIRED");
    await expect(migration.down({} as never)).rejects.toThrow(
      "E2EE_MEETING_MIGRATION_IRREVERSIBLE",
    );
  });
});
