import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "meeting_document_updates" })
export class MeetingDocumentUpdate {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "document_id", type: "uuid" })
  documentId: string;

  @Column({ name: "snapshot_id", type: "uuid" })
  snapshotId: string;

  @Column({ name: "ock_id", type: "uuid" })
  ockId: string;

  @Column({ name: "meeting_codec", type: "integer" })
  meetingCodec: number;

  @Column({ name: "client_epoch_id", type: "uuid" })
  clientEpochId: string;

  @Column({ name: "author_clock", type: "bigint" })
  authorClock: string;

  @Column({ name: "server_sequence", type: "bigint" })
  serverSequence: string;

  @Column({ type: "bytea" })
  envelope: Buffer;

  @Column({ name: "envelope_fingerprint", type: "bytea" })
  envelopeFingerprint: Buffer;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
