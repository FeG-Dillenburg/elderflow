import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "meeting_document_mutations" })
export class MeetingDocumentMutation {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ name: "meeting_id", type: "uuid" })
  meetingId: string;

  @Column({ name: "appearance_id", type: "uuid" })
  appearanceId: string;

  @Column({ name: "source_appearance_id", type: "uuid", nullable: true })
  sourceAppearanceId: string | null;

  @Column({ name: "update_id", type: "uuid" })
  updateId: string;

  @Column({ name: "request_fingerprint", type: "bytea" })
  requestFingerprint: Buffer;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
