import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "meeting_document_snapshots" })
export class MeetingDocumentSnapshot {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ name: "document_id", type: "uuid" })
  documentId: string;

  @Column({ name: "parent_snapshot_id", type: "uuid", nullable: true })
  parentSnapshotId: string | null;

  @Column({ name: "parent_envelope_hash", type: "bytea" })
  parentEnvelopeHash: Buffer;

  @Column({ name: "covered_server_sequence", type: "bigint" })
  coveredServerSequence: string;

  @Column({ name: "covered_author_clocks", type: "jsonb" })
  coveredAuthorClocks: Array<[string, string]>;

  @Column({ name: "ock_id", type: "uuid" })
  ockId: string;

  @Column({ name: "meeting_codec", type: "integer" })
  meetingCodec: number;

  @Column({ name: "client_epoch_id", type: "uuid" })
  clientEpochId: string;

  @Column({ name: "snapshot_clock", type: "bigint" })
  snapshotClock: string;

  @Column({ type: "bytea" })
  envelope: Buffer;

  @Column({ name: "envelope_fingerprint", type: "bytea" })
  envelopeFingerprint: Buffer;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
