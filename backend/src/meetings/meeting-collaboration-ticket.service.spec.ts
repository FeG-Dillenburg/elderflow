import { MeetingCollaborationTicket } from "./meeting-collaboration-ticket.entity";
import { MeetingCollaborationTicketService } from "./meeting-collaboration-ticket.service";
import { MeetingDocument } from "./meeting-document.entity";
import { Meeting } from "./meeting.entity";
import { User } from "../users/user.entity";

describe("MeetingCollaborationTicketService", () => {
  const rawTicket = Buffer.alloc(32, 7).toString("base64url");
  const ticket = {
    meetingId: "meeting",
    documentId: "document",
    userId: "user",
    sessionVersion: 3,
    expiresAt: new Date(Date.now() + 30_000),
    usedAt: null,
  };
  const user = {
    id: "user",
    role: "admin",
    sessionVersion: 3,
    archivedAt: null,
  };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    transaction: jest.fn(),
  };
  const repository = {
    manager,
  };
  const service = new MeetingCollaborationTicketService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
    manager.transaction.mockImplementation(async (work) => work(manager));
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === MeetingCollaborationTicket) return { ...ticket };
      if (entity === User) return { ...user };
      if (entity === Meeting) return { id: "meeting", status: "planned" };
      if (entity === MeetingDocument) return { id: "document", meetingId: "meeting" };
      return null;
    });
  });

  const expectCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
  };

  it("consumes a ticket once and binds it to its document", async () => {
    await expect(service.consume(rawTicket, "document")).resolves.toMatchObject({
      meetingId: "meeting",
      documentId: "document",
      user: expect.objectContaining({ id: "user" }),
    });

    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({
      usedAt: expect.any(Date),
    }));
  });

  it.each([
    ["reused", { usedAt: new Date() }, "document"],
    ["expired", { expiresAt: new Date(Date.now() - 1) }, "document"],
    ["bound to another document", {}, "other-document"],
  ])("rejects a %s ticket", async (_label, ticketOverride, expectedDocumentId) => {
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === MeetingCollaborationTicket) return { ...ticket, ...ticketOverride };
      return null;
    });

    await expectCode(
      service.consume(rawTicket, expectedDocumentId),
      "E2EE_COLLABORATION_TICKET_INVALID",
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("rejects a ticket after the user's session or role is revoked", async () => {
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === MeetingCollaborationTicket) return { ...ticket };
      if (entity === User) return { ...user, sessionVersion: 4, role: "guest" };
      if (entity === Meeting) return { id: "meeting", status: "planned" };
      if (entity === MeetingDocument) return { id: "document", meetingId: "meeting" };
      return null;
    });

    await expectCode(
      service.consume(rawTicket, "document"),
      "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
