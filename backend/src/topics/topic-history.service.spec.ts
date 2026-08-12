import { getRepositoryToken } from "@nestjs/typeorm";
import { Test } from "@nestjs/testing";
import { MeetingTopic } from "../meetings/meeting-topic.entity";
import { SkippedRecurrence } from "../recurrence/skipped-recurrence.entity";
import { User } from "../users/user.entity";
import { TopicUpdate } from "./topic-update.entity";
import { Topic } from "./topic.entity";
import { TopicHistoryService } from "./topic-history.service";

describe("TopicHistoryService encrypted read model", () => {
  const topics = { findOne: jest.fn() };
  const updates = { find: jest.fn() };
  const appearances = { find: jest.fn() };
  const skippedRecurrences = { find: jest.fn() };
  const viewer = { role: "user" } as User;
  let service: TopicHistoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TopicHistoryService,
        { provide: getRepositoryToken(Topic), useValue: topics },
        { provide: getRepositoryToken(TopicUpdate), useValue: updates },
        { provide: getRepositoryToken(MeetingTopic), useValue: appearances },
        { provide: getRepositoryToken(SkippedRecurrence), useValue: skippedRecurrences },
      ],
    }).compile();
    service = module.get(TopicHistoryService);
    topics.findOne.mockResolvedValue({
      id: "topic",
      type: "generic",
      nameEnvelope: Buffer.from([1]),
      nameCommitRevision: "1",
      membershipProcessStatusEnvelope: Buffer.from([2]),
      membershipProcessStatusCommitRevision: "1",
      godparentsEnvelope: Buffer.from([3]),
      godparentsCommitRevision: "1",
      responsibleUser: { firstName: "Live", lastName: "Owner" },
    });
    updates.find.mockResolvedValue([]);
    appearances.find.mockResolvedValue([]);
    skippedRecurrences.find.mockResolvedValue([]);
  });

  it("returns standalone Update ciphertext but never its plaintext or broad relations", async () => {
    updates.find.mockResolvedValue([{
      id: "update",
      meetingId: null,
      date: new Date("2026-07-15T20:00:00Z"),
      textEnvelope: Buffer.from([1, 2, 3]),
      textCommitRevision: "2",
      createdBy: { firstName: "Ada", lastName: "Lovelace" },
    }]);

    await expect(service.getHistory("topic", viewer)).resolves.toEqual([
      expect.objectContaining({
        kind: "standalone_update",
        protected: { textEnvelope: "AQID", textCommitRevision: "2" },
        createdByDisplayName: "Ada Lovelace",
      }),
    ]);
    const serialized = JSON.stringify(await service.getHistory("topic", viewer));
    expect(serialized).not.toContain('"text":');
    expect(serialized).not.toContain('"meeting":null');
  });

  it("withholds Update ciphertext from Guests", async () => {
    updates.find.mockResolvedValue([{
      id: "update",
      meetingId: null,
      date: new Date("2026-07-15T20:00:00Z"),
      textEnvelope: Buffer.from([1]),
      textCommitRevision: "1",
    }]);

    await expect(service.getHistory("topic", { role: "guest" } as User)).resolves.toEqual([
      expect.objectContaining({ protected: null }),
    ]);
  });

  it("keeps Meeting structure navigable while document content fails closed", async () => {
    appearances.find.mockResolvedValue([{
      id: "appearance",
      meetingId: "meeting",
      deferredAt: null,
      meeting: {
        id: "meeting",
        date: "2026-07-15",
        beginTime: "20:00:00",
        status: "completed",
        title: "Council",
      },
      section: { id: "section", name: "Main" },
    }]);

    await expect(service.getHistory("topic", viewer)).resolves.toEqual([
      expect.objectContaining({
        kind: "meeting_appearance",
        meetingDocument: { meetingId: "meeting", appearanceId: "appearance" },
        meeting: expect.objectContaining({ id: "meeting", date: "2026-07-15" }),
        section: { id: "section", name: "Main" },
        topic: expect.objectContaining({ protectedUnavailable: true }),
      }),
    ]);
  });

  it("withholds Meeting title ciphertext from Guests", async () => {
    appearances.find.mockResolvedValue([{
      id: "appearance",
      meetingId: "meeting",
      meeting: {
        id: "meeting",
        date: "2026-07-15",
        beginTime: "20:00:00",
        status: "completed",
        titleEnvelope: Buffer.from([9]),
        titleCommitRevision: "2",
      },
    }]);

    const [entry] = await service.getHistory("topic", { role: "guest" } as User);
    expect(entry).toMatchObject({
      kind: "meeting_appearance",
      meeting: { protected: null },
    });
  });

  it("returns immutable encrypted Topic snapshots without Meeting-document plaintext", async () => {
    appearances.find.mockResolvedValue([{
      id: "appearance",
      meetingId: "meeting",
      topicNameSnapshotEnvelope: Buffer.from([11]),
      topicNameSnapshotCommitRevision: "4",
      membershipProcessStatusSnapshotEnvelope: Buffer.from([12]),
      membershipProcessStatusSnapshotCommitRevision: "5",
      godparentsSnapshotEnvelope: Buffer.from([13]),
      godparentsSnapshotCommitRevision: "6",
      meeting: {
        id: "meeting",
        date: "2026-07-15",
        beginTime: "20:00:00",
        status: "completed",
      },
    }]);

    const [entry] = await service.getHistory("topic", viewer);
    expect(entry).toMatchObject({
      topic: {
        id: "topic",
        protected: {
          nameEnvelope: "Cw",
          nameCommitRevision: "4",
          membershipProcessStatusEnvelope: "DA",
          godparentsEnvelope: "DQ",
        },
        protectedUnavailable: false,
      },
      meetingDocument: { meetingId: "meeting", appearanceId: "appearance" },
    });
    expect(JSON.stringify(entry)).not.toContain("SnapshotEnvelope");
  });

  it("preserves the stable missing-Topic error", async () => {
    topics.findOne.mockResolvedValue(null);
    await expect(service.getHistory("missing", viewer)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TOPIC_NOT_FOUND" }),
    });
  });
});
