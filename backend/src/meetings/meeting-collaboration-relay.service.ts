import { HttpAdapterHost } from "@nestjs/core";
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { E2eeClientEpoch } from "../e2ee/e2ee-client-epoch.entity";
import { E2eeKeyState } from "../e2ee/e2ee-key-state.entity";
import { meetingAwarenessClientEpochId, validateMeetingAwarenessEnvelope } from "../e2ee/meeting-document-envelope-validator";
import sodium from "libsodium-wrappers-sumo";
import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import { User } from "../users/user.entity";
import { Meeting } from "./meeting.entity";
import { MeetingCollaborationTicketService, type ConsumedCollaborationTicket } from "./meeting-collaboration-ticket.service";
import { MeetingsService } from "./meetings.service";
import {
  meetingCollaborationEvents,
  type MeetingCompactedEvent,
  type MeetingCompletedEvent,
} from "./meeting-collaboration-events";

type Client = WebSocket & {
  collaboration?: ConsumedCollaborationTicket;
  reauthorization?: ReturnType<typeof setInterval>;
};

@Injectable()
export class MeetingCollaborationRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MeetingCollaborationRelayService.name);
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 1_500_000 });
  private readonly rooms = new Map<string, Set<Client>>();
  private readonly awarenessClocks = new Map<string, number>();
  private httpServer?: HttpServer;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly tickets: MeetingCollaborationTicketService,
    private readonly meetings: MeetingsService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter.getHttpServer() as HttpServer;
    this.httpServer = httpServer;
    httpServer.on("upgrade", this.upgrade);
    this.server.on("connection", (socket: Client) => this.connected(socket));
    meetingCollaborationEvents.on("completed", this.meetingCompleted);
    meetingCollaborationEvents.on("compacted", this.meetingCompacted);
  }

  onApplicationShutdown(): void {
    this.httpServer?.off("upgrade", this.upgrade);
    meetingCollaborationEvents.off("completed", this.meetingCompleted);
    meetingCollaborationEvents.off("compacted", this.meetingCompacted);
    for (const room of this.rooms.values()) for (const socket of room) socket.close(1012);
    this.server.close();
  }

  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/meetings/collaboration" || url.search) return;
    this.server.handleUpgrade(request, socket, head, (client) => {
      this.server.emit("connection", client, request);
    });
  };

  private connected(socket: Client): void {
    const timeout = setTimeout(() => socket.close(4401, "E2EE_COLLABORATION_AUTH_REQUIRED"), 5_000);
    socket.once("message", async (data, binary) => {
      try {
        const encoded = data.toString();
        if (binary || Buffer.byteLength(encoded) > 512) throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
        const frame = JSON.parse(encoded) as Record<string, unknown>;
        if (frame.type !== "authenticate" || typeof frame.ticket !== "string"
          || typeof frame.documentId !== "string") throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
        socket.collaboration = await this.tickets.consume(frame.ticket, frame.documentId);
        clearTimeout(timeout);
        const room = this.rooms.get(frame.documentId) ?? new Set<Client>();
        room.add(socket);
        this.rooms.set(frame.documentId, room);
        socket.send(JSON.stringify({ type: "authenticated", documentId: frame.documentId }));
        socket.reauthorization = setInterval(() => void this.reauthorize(socket), 10_000);
        socket.on("message", (payload, isBinary) => void this.message(socket, payload, isBinary));
        socket.on("close", () => this.remove(socket));
      } catch (error) {
        clearTimeout(timeout);
        socket.close(4401, this.code(error));
      }
    });
  }

  private async message(socket: Client, data: RawData, binary: boolean): Promise<void> {
    try {
      const encoded = data.toString();
      if (binary || Buffer.byteLength(encoded) > 1_500_000 || !socket.collaboration) {
        throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
      }
      const frame = JSON.parse(encoded) as Record<string, unknown>;
      if (frame.type === "awareness") {
        await this.assertConnectionActive(socket.collaboration);
        const envelope = this.opaqueEnvelope(frame.envelope, 5_000);
        const metadata = await this.validateAwareness(socket.collaboration, envelope);
        this.broadcast(socket.collaboration.documentId, socket, {
          type: "awareness",
          envelope,
          ...metadata,
        });
        return;
      }
      if (frame.type !== "update") throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
      await this.assertConnectionActive(socket.collaboration);
      const envelope = this.opaqueEnvelope(frame.envelope, 1_050_000);
      const result = await this.meetings.appendWorkspaceUpdate(
        socket.collaboration.meetingId,
        envelope,
        socket.collaboration.user,
        typeof frame.appearanceId === "string" ? frame.appearanceId : undefined,
      );
      const update = await this.dataSource.getRepository(E2eeClientEpoch).findOneByOrFail({
        id: result.clientEpochId,
      });
      const accepted = {
        type: "update",
        updateId: result.updateId,
        clientEpochId: result.clientEpochId,
        authorClock: result.authorClock,
        serverSequence: result.serverSequence,
        signingPublicKey: update.signingPublicKey.toString("base64url"),
        envelope,
      };
      socket.send(JSON.stringify({ ...accepted, type: "acknowledged" }));
      this.broadcast(socket.collaboration.documentId, socket, accepted);
    } catch (error) {
      const code = this.code(error);
      socket.send(JSON.stringify({ type: "rejected", code }));
      if (["MEETING_COMPLETED_IMMUTABLE", "E2EE_CLIENT_EPOCH_INVALID", "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN"].includes(code)) {
        socket.close(4403, code);
      }
    }
  }

  private broadcast(documentId: string, sender: Client, frame: object): void {
    const encoded = JSON.stringify(frame);
    for (const client of this.rooms.get(documentId) ?? []) {
      if (client !== sender && client.readyState === WebSocket.OPEN) client.send(encoded);
    }
  }

  private remove(socket: Client): void {
    if (socket.reauthorization) clearInterval(socket.reauthorization);
    const documentId = socket.collaboration?.documentId;
    if (!documentId) return;
    const room = this.rooms.get(documentId);
    room?.delete(socket);
    if (room?.size === 0) this.rooms.delete(documentId);
  }

  private async reauthorize(socket: Client): Promise<void> {
    if (!socket.collaboration || socket.readyState !== WebSocket.OPEN) return;
    try {
      await this.assertConnectionActive(socket.collaboration);
    } catch (error) {
      const code = this.code(error);
      socket.send(JSON.stringify({ type: "rejected", code }));
      socket.close(4403, code);
    }
  }

  private readonly meetingCompleted = (event: MeetingCompletedEvent): void => {
    setTimeout(() => {
      for (const room of this.rooms.values()) {
        for (const socket of room) {
          if (socket.collaboration?.meetingId !== event.meetingId
            || socket.readyState !== WebSocket.OPEN) continue;
          socket.send(JSON.stringify({
            type: "rejected",
            code: "MEETING_COMPLETED_IMMUTABLE",
          }));
          socket.close(4403, "MEETING_COMPLETED_IMMUTABLE");
        }
      }
    }, 250);
  };

  private readonly meetingCompacted = (event: MeetingCompactedEvent): void => {
    for (const room of this.rooms.values()) {
      for (const socket of room) {
        if (socket.collaboration?.meetingId === event.meetingId
          && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "parent-changed" }));
        }
      }
    }
  };

  private opaqueEnvelope(value: unknown, maximum: number): string {
    if (typeof value !== "string") throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
    const decoded = Buffer.from(value, "base64url");
    if (!decoded.length || decoded.length > maximum || decoded.toString("base64url") !== value) {
      throw new Error("E2EE_COLLABORATION_FRAME_INVALID");
    }
    return value;
  }

  private async assertConnectionActive(connection: ConsumedCollaborationTicket): Promise<void> {
    const [user, meeting] = await Promise.all([
      this.dataSource.getRepository(User).findOneBy({ id: connection.user.id }),
      this.dataSource.getRepository(Meeting).findOneBy({ id: connection.meetingId }),
    ]);
    if (!user || user.archivedAt || user.sessionVersion !== connection.user.sessionVersion
      || !isE2eeKeyOperator(user.role)) throw new Error("E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN");
    if (!meeting || meeting.status === "completed") throw new Error("MEETING_COMPLETED_IMMUTABLE");
  }

  private async validateAwareness(connection: ConsumedCollaborationTicket, encoded: string) {
    const envelope = Buffer.from(encoded, "base64url");
    const clientEpochId = meetingAwarenessClientEpochId(envelope);
    const [state, epoch] = await Promise.all([
      this.dataSource.getRepository(E2eeKeyState).findOneBy({ id: 1 }),
      this.dataSource.getRepository(E2eeClientEpoch).findOneBy({ id: clientEpochId }),
    ]);
    if (!state || !epoch || epoch.revokedAt || epoch.userId !== connection.user.id
      || epoch.organizationId !== state.organizationId) throw new Error("E2EE_CLIENT_EPOCH_INVALID");
    await sodium.ready;
    const metadata = validateMeetingAwarenessEnvelope(envelope, {
      organizationId: state.organizationId,
      documentId: connection.documentId,
      ockId: state.ockId,
      clientEpochId,
      noncePrefix: epoch.noncePrefix,
      signingPublicKey: epoch.signingPublicKey,
    });
    const clockKey = `${connection.documentId}:${clientEpochId}`;
    if (metadata.awarenessClock <= (this.awarenessClocks.get(clockKey) ?? 0)) {
      throw new Error("E2EE_AWARENESS_REPLAY");
    }
    this.awarenessClocks.set(clockKey, metadata.awarenessClock);
    return {
      clientEpochId,
      awarenessClock: String(metadata.awarenessClock),
      signingPublicKey: epoch.signingPublicKey.toString("base64url"),
    };
  }

  private code(error: unknown): string {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    const code = typeof response === "object" && response && "code" in response
      ? (response as { code: unknown }).code : (error as Error)?.message;
    const stable = typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
      ? code : "E2EE_COLLABORATION_FRAME_INVALID";
    this.logger.warn({ outcome: stable });
    return stable;
  }
}
