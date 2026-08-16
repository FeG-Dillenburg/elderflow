import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "node:crypto";
import { IsNull, LessThan, Repository } from "typeorm";
import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { codedHttpException } from "../errors/coded-http.exception";
import { User } from "../users/user.entity";
import { MeetingCollaborationTicket } from "./meeting-collaboration-ticket.entity";
import { MeetingDocument } from "./meeting-document.entity";
import { Meeting } from "./meeting.entity";

export interface ConsumedCollaborationTicket {
  meetingId: string;
  documentId: string;
  user: User;
}

@Injectable()
export class MeetingCollaborationTicketService {
  constructor(
    @InjectRepository(MeetingCollaborationTicket)
    private readonly tickets: Repository<MeetingCollaborationTicket>,
  ) {}

  async mint(meetingId: string, user: User) {
    if (!isE2eeKeyOperator(user.role)) this.forbidden();
    const meeting = await this.tickets.manager.findOne(Meeting, { where: { id: meetingId } });
    if (!meeting) throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
    if (meeting.status === "completed") {
      throw codedHttpException(HttpStatus.CONFLICT, "MEETING_COMPLETED_IMMUTABLE", "Completed Meeting content cannot be changed");
    }
    const document = await this.tickets.manager.findOne(MeetingDocument, { where: { meetingId } });
    if (!document?.activeSnapshotId) {
      throw codedHttpException(HttpStatus.CONFLICT, "MEETING_WORKSPACE_UNAVAILABLE", "Meeting workspace is unavailable");
    }
    await this.tickets.delete({ expiresAt: LessThan(new Date()) });
    const raw = randomBytes(32);
    const expiresAt = new Date(Date.now() + 30_000);
    await this.tickets.save(this.tickets.create({
      ticketHash: this.hash(raw),
      meetingId,
      documentId: document.id,
      userId: user.id,
      sessionVersion: user.sessionVersion,
      expiresAt,
      usedAt: null,
    }));
    return {
      ticket: raw.toString("base64url"),
      documentId: document.id,
      expiresAt: expiresAt.toISOString(),
      websocketPath: "/api/meetings/collaboration",
    };
  }

  async consume(encoded: string, expectedDocumentId: string): Promise<ConsumedCollaborationTicket> {
    const raw = Buffer.from(encoded, "base64url");
    if (raw.length !== 32 || raw.toString("base64url") !== encoded) this.invalid();
    return this.tickets.manager.transaction(async (manager) => {
      const ticket = await manager.findOne(MeetingCollaborationTicket, {
        where: { ticketHash: this.hash(raw) },
        lock: { mode: "pessimistic_write" },
      });
      if (!ticket || ticket.usedAt || ticket.expiresAt.getTime() <= Date.now()
        || ticket.documentId !== expectedDocumentId) this.invalid();
      const [user, meeting, document] = await Promise.all([
        manager.findOne(User, { where: { id: ticket.userId, archivedAt: IsNull() } }),
        manager.findOne(Meeting, { where: { id: ticket.meetingId } }),
        manager.findOne(MeetingDocument, { where: { id: ticket.documentId } }),
      ]);
      if (!user || user.sessionVersion !== ticket.sessionVersion || !isE2eeKeyOperator(user.role)) this.forbidden();
      if (!meeting || meeting.status === "completed" || document?.meetingId !== meeting.id) this.invalid();
      ticket.usedAt = new Date();
      await manager.save(ticket);
      return { meetingId: ticket.meetingId, documentId: ticket.documentId, user };
    });
  }

  private hash(value: Uint8Array): Buffer {
    return createHash("sha256").update(value).digest();
  }

  private invalid(): never {
    throw codedHttpException(HttpStatus.UNAUTHORIZED, "E2EE_COLLABORATION_TICKET_INVALID", "Collaboration ticket is invalid");
  }

  private forbidden(): never {
    throw codedHttpException(HttpStatus.FORBIDDEN, "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN", "This role cannot access Protected ciphertext");
  }
}
