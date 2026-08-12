import { Reflector } from "@nestjs/core";
import { PERMISSION_CATEGORY_KEY } from "../auth/permissions";
import { MeetingsController } from "./meetings.controller";

describe("MeetingsController encrypted workspace boundary", () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    appendWorkspaceUpdate: jest.fn(),
    addTopic: jest.fn(),
  };
  const controller = new MeetingsController(service as never);
  const user = { id: "user" } as never;

  beforeEach(() => jest.clearAllMocks());

  it("passes encrypted creation and initial document bytes to one service command", async () => {
    const input = {
      id: "00000000-0000-4000-8000-000000000001",
      protected: { titleEnvelope: "opaque-title" },
      document: {
        documentId: "00000000-0000-4000-8000-000000000002",
        snapshotId: "00000000-0000-4000-8000-000000000003",
        snapshotEnvelope: "opaque-document",
      },
    } as never;
    service.create.mockResolvedValue({ id: "meeting" });

    await controller.create(input, user);

    expect(service.create).toHaveBeenCalledWith(input, user);
  });

  it("uses one authorized command for atomic appearance and initial update creation", async () => {
    const input = {
      id: "00000000-0000-4000-8000-000000000004",
      mutationId: "00000000-0000-4000-8000-000000000005",
      topicId: "00000000-0000-4000-8000-000000000006",
      sectionId: "00000000-0000-4000-8000-000000000007",
      initialUpdateEnvelope: "opaque-update",
    } as never;

    await controller.addTopic("meeting", input, user);

    expect(service.addTopic).toHaveBeenCalledWith("meeting", input, user);
  });

  it("keeps workspace endpoints under backend Meeting authorization", () => {
    const reflector = new Reflector();
    expect(reflector.getAllAndOverride(PERMISSION_CATEGORY_KEY, [
      MeetingsController.prototype.appendWorkspaceUpdate,
      MeetingsController,
    ])).toBe("meetings");
    expect(reflector.getAllAndOverride(PERMISSION_CATEGORY_KEY, [
      MeetingsController.prototype.workspace,
      MeetingsController,
    ])).toBe("meetings");
  });
});
