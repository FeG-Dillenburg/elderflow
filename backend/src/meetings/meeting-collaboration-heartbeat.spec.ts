import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { MeetingCollaborationRelayService } from "./meeting-collaboration-relay.service";
import { MeetingCompactionCoordinator } from "./meeting-compaction-coordinator";
import { User } from "../users/user.entity";

describe("Meeting collaboration heartbeat protocol", () => {
  let server: Server;
  let relay: MeetingCollaborationRelayService;
  let coordinator: MeetingCompactionCoordinator;
  const clients: WebSocket[] = [];
  const user = { id: "user", role: "user", sessionVersion: 1 };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    server = createServer();
    coordinator = new MeetingCompactionCoordinator();
    relay = new MeetingCollaborationRelayService(
      { httpAdapter: { getHttpServer: () => server } } as never,
      { consume: async () => ({ user, meetingId: "meeting", documentId: "document" }) } as never,
      {} as never,
      { getRepository: (entity: unknown) => ({ findOneBy: async () => entity === User
        ? user : { id: "meeting", status: "in_progress" } }) } as never,
      coordinator,
    );
    relay.onApplicationBootstrap();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      if (client.readyState === WebSocket.CLOSED) continue;
      const closed = once(client, "close");
      client.terminate();
      await closed;
    }
    relay.onApplicationShutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    jest.useRealTimers();
  });

  async function connect() {
    const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/meetings/collaboration`);
    clients.push(client);
    await once(client, "open");
    const authenticated = once(client, "message");
    client.send(JSON.stringify({ type: "authenticate", ticket: "ticket", documentId: "document" }));
    await authenticated;
    return client;
  }

  async function ping(client: WebSocket) {
    const received = once(client, "message");
    await jest.advanceTimersByTimeAsync(10_000);
    const [data] = await received;
    const frame = JSON.parse(data.toString());
    expect(frame).toMatchObject({ type: "ping", id: expect.any(String) });
    return frame;
  }

  it("removes six-times-unresponsive participants and permits a new connection", async () => {
    const client = await connect();
    for (let attempt = 0; attempt < 6; attempt += 1) await ping(client);
    expect(client.readyState).toBe(WebSocket.OPEN);
    await jest.advanceTimersByTimeAsync(9_000);
    const interrupted = coordinator.beginCompletion("meeting", "document", "user", async () => "7");
    const aborted = expect(interrupted).rejects.toMatchObject({ response: { code: "MEETING_COMPLETION_RETRY" } });
    const closed = once(client, "close");
    await jest.advanceTimersByTimeAsync(1_000);
    await closed;
    await aborted;
    const claim = await coordinator.beginCompletion("meeting", "document", "user", async () => "7");
    expect(claim.serverSequence).toBe("7");
    coordinator.fail("meeting", claim.barrierId);
    const reconnected = await connect();
    await ping(reconnected);
  });

  it("resets consecutive misses only for a matching pong", async () => {
    const client = await connect();
    for (let attempt = 0; attempt < 5; attempt += 1) await ping(client);
    const frame = await ping(client);
    client.send(JSON.stringify({ type: "pong", id: frame.id }));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    for (let attempt = 0; attempt < 6; attempt += 1) await ping(client);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.send(JSON.stringify({ type: "pong", id: frame.id }));
    const closed = once(client, "close");
    await jest.advanceTimersByTimeAsync(10_000);
    await closed;
  });
});
