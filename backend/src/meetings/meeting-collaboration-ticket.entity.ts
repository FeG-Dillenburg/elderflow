import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "meeting_collaboration_tickets" })
export class MeetingCollaborationTicket {
  @PrimaryColumn({ name: "ticket_hash", type: "bytea" })
  ticketHash: Buffer;

  @Column({ name: "meeting_id", type: "uuid" })
  meetingId: string;

  @Column({ name: "document_id", type: "uuid" })
  documentId: string;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Column({ name: "session_version", type: "integer" })
  sessionVersion: number;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
