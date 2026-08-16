import { newDb } from "pg-mem";
import { MeetingMutationCompaction1720000017000 } from "./1720000017000-MeetingMutationCompaction";

describe("Meeting mutation compaction migration", () => {
  it("lets compaction delete a covered update while retaining its mutation replay record", async () => {
    const database = newDb();
    database.public.none(`
      CREATE TABLE "meeting_document_updates" (
        "id" uuid PRIMARY KEY
      );
      CREATE TABLE "meeting_document_mutations" (
        "id" uuid PRIMARY KEY,
        "update_id" uuid NOT NULL,
        CONSTRAINT "meeting_document_mutations_update_id_fkey"
          FOREIGN KEY ("update_id") REFERENCES "meeting_document_updates"("id")
      );
      INSERT INTO "meeting_document_updates" ("id")
        VALUES ('00000000-0000-4000-8000-000000000001');
      INSERT INTO "meeting_document_mutations" ("id", "update_id")
        VALUES (
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001'
        );
    `);
    await new MeetingMutationCompaction1720000017000().up({
      query: async (sql: string) => database.public.none(sql),
    } as never);

    expect(() => database.public.none(`
      DELETE FROM "meeting_document_updates"
      WHERE "id" = '00000000-0000-4000-8000-000000000001'
    `)).not.toThrow();
    expect(database.public.one(`
      SELECT "id", "update_id" FROM "meeting_document_mutations"
    `)).toEqual({
      id: "00000000-0000-4000-8000-000000000002",
      update_id: null,
    });
  });

  it("is forward-only", async () => {
    await expect(new MeetingMutationCompaction1720000017000().down())
      .rejects.toThrow("E2EE_MEETING_MUTATION_COMPACTION_MIGRATION_IRREVERSIBLE");
  });
});
