import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from "typeorm";
import { Meeting } from "./meeting.entity";

@Entity({ name: "meeting_documents" })
export class MeetingDocument {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ name: "meeting_id", type: "uuid", unique: true })
  meetingId: string;

  @OneToOne(() => Meeting, { onDelete: "CASCADE" })
  @JoinColumn({ name: "meeting_id" })
  meeting?: Meeting;

  @Column({ name: "envelope_format", type: "integer", default: 1 })
  envelopeFormat: number;

  @Column({ name: "crypto_suite", type: "integer", default: 1 })
  cryptoSuite: number;

  @Column({ name: "meeting_codec", type: "integer", default: 2 })
  meetingCodec: number;

  @Column({ name: "active_snapshot_id", type: "uuid", nullable: true })
  activeSnapshotId: string | null;

  @Column({ name: "current_server_sequence", type: "bigint", default: 0 })
  currentServerSequence: string;

  @Column({ name: "completed_server_sequence", type: "bigint", nullable: true })
  completedServerSequence: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
