import { HttpStatus, Injectable } from "@nestjs/common";
import sodium from "libsodium-wrappers-sumo";
import { EntityManager, In } from "typeorm";
import { E2eeClientEpoch } from "../e2ee/e2ee-client-epoch.entity";
import { E2eeKeyState } from "../e2ee/e2ee-key-state.entity";
import { isE2eeKeyOperator } from "../e2ee/e2ee-role-policy";
import {
  meetingSnapshotClientEpochId,
  meetingUpdateClientEpochId,
  validateMeetingSnapshotEnvelope,
  validateMeetingUpdateEnvelope,
} from "../e2ee/meeting-document-envelope-validator";
import { codedHttpException } from "../errors/coded-http.exception";
import { User } from "../users/user.entity";
import { MeetingDocument } from "./meeting-document.entity";
import { MeetingDocumentSnapshot } from "./meeting-document-snapshot.entity";
import { MeetingDocumentUpdate } from "./meeting-document-update.entity";
import { Meeting } from "./meeting.entity";

const ROOT_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000000";

@Injectable()
export class MeetingDocumentService {
  assertContentUser(user: User): void {
    if (!isE2eeKeyOperator(user.role)) {
      throw codedHttpException(
        HttpStatus.FORBIDDEN,
        "E2EE_PROTECTED_CIPHERTEXT_FORBIDDEN",
        "This role cannot access Protected ciphertext",
      );
    }
  }

  async createInitial(
    manager: EntityManager,
    user: User,
    meetingId: string,
    input: { documentId: string; snapshotId: string; snapshotEnvelope: string },
  ): Promise<MeetingDocument> {
    this.assertContentUser(user);
    const envelope = this.decodeEnvelope(input.snapshotEnvelope, 16_800_000);
    const clientEpochId = meetingSnapshotClientEpochId(envelope);
    const { state, epoch } = await this.context(manager, user, clientEpochId);
    await sodium.ready;
    const metadata = validateMeetingSnapshotEnvelope(envelope, {
      organizationId: state.organizationId,
      documentId: input.documentId,
      snapshotId: input.snapshotId,
      ockId: state.ockId,
      clientEpochId,
      noncePrefix: epoch.noncePrefix,
      signingPublicKey: epoch.signingPublicKey,
    });
    if (metadata.parentSnapshotId !== ROOT_SNAPSHOT_ID
      || metadata.coveredServerSequence !== 0
      || metadata.coveredAuthorClocks.length !== 0
      || metadata.parentEnvelopeHash.some((byte) => byte !== 0)) {
      throw codedHttpException(
        HttpStatus.BAD_REQUEST,
        "E2EE_SNAPSHOT_PARENT_INVALID",
        "Initial Meeting snapshot has invalid ancestry",
      );
    }
    const document = await manager.save(MeetingDocument, manager.create(MeetingDocument, {
      id: input.documentId,
      meetingId,
      envelopeFormat: 1,
      cryptoSuite: 1,
      meetingCodec: 2,
      activeSnapshotId: null,
      currentServerSequence: "0",
      completedServerSequence: null,
    }));
    await manager.save(MeetingDocumentSnapshot, manager.create(MeetingDocumentSnapshot, {
      id: input.snapshotId,
      documentId: document.id,
      parentSnapshotId: null,
      parentEnvelopeHash: metadata.parentEnvelopeHash,
      coveredServerSequence: "0",
      coveredAuthorClocks: [],
      ockId: state.ockId,
      meetingCodec: 2,
      clientEpochId,
      snapshotClock: String(metadata.snapshotClock),
      envelope,
      envelopeFingerprint: metadata.fingerprint,
    }));
    document.activeSnapshotId = input.snapshotId;
    return manager.save(MeetingDocument, document);
  }

  async appendUpdate(
    manager: EntityManager,
    user: User,
    meetingId: string,
    encodedEnvelope: string,
  ): Promise<{ update: MeetingDocumentUpdate; duplicate: boolean }> {
    this.assertContentUser(user);
    const meeting = await manager.findOne(Meeting, {
      where: { id: meetingId },
      lock: { mode: "pessimistic_write" },
    });
    if (!meeting) {
      throw codedHttpException(HttpStatus.NOT_FOUND, "MEETING_NOT_FOUND", "Meeting not found");
    }
    if (meeting.status === "completed") {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "MEETING_COMPLETED_IMMUTABLE",
        "Completed Meeting content cannot be changed",
      );
    }
    const document = await manager.findOne(MeetingDocument, {
      where: { meetingId },
      lock: { mode: "pessimistic_write" },
    });
    if (!document?.activeSnapshotId) {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "MEETING_WORKSPACE_UNAVAILABLE",
        "Meeting workspace is unavailable",
      );
    }
    const envelope = this.decodeEnvelope(encodedEnvelope, 1_050_000);
    const clientEpochId = meetingUpdateClientEpochId(envelope);
    const { state, epoch } = await this.context(manager, user, clientEpochId);
    await sodium.ready;
    const metadata = validateMeetingUpdateEnvelope(envelope, {
      organizationId: state.organizationId,
      documentId: document.id,
      activeSnapshotId: document.activeSnapshotId,
      ockId: state.ockId,
      clientEpochId,
      noncePrefix: epoch.noncePrefix,
      signingPublicKey: epoch.signingPublicKey,
    });
    const existing = await manager.findOne(MeetingDocumentUpdate, {
      where: {
        documentId: document.id,
        clientEpochId,
        authorClock: String(metadata.authorClock),
      },
    });
    const latest = await manager.findOne(MeetingDocumentUpdate, {
      where: { documentId: document.id, clientEpochId },
      order: { authorClock: "DESC" },
    });
    if (existing) {
      if (!existing.envelopeFingerprint.equals(metadata.fingerprint)) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "E2EE_COUNTER_REUSE",
          "Meeting update counter was reused with different bytes",
        );
      }
      if (existing.authorClock !== latest?.authorClock) {
        throw codedHttpException(
          HttpStatus.CONFLICT,
          "E2EE_UPDATE_REPLAY",
          "Only the latest Meeting update may be retried",
        );
      }
      return { update: existing, duplicate: true };
    }
    if (BigInt(metadata.authorClock) !== BigInt(latest?.authorClock ?? "0") + 1n) {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "E2EE_AUTHOR_CLOCK_GAP",
        "Meeting update author clock is not sequential",
      );
    }
    document.currentServerSequence = String(BigInt(document.currentServerSequence) + 1n);
    const update = await manager.save(MeetingDocumentUpdate, manager.create(MeetingDocumentUpdate, {
      documentId: document.id,
      snapshotId: document.activeSnapshotId,
      ockId: state.ockId,
      meetingCodec: 2,
      clientEpochId,
      authorClock: String(metadata.authorClock),
      serverSequence: document.currentServerSequence,
      envelope,
      envelopeFingerprint: metadata.fingerprint,
    }));
    await manager.save(MeetingDocument, document);
    return { update, duplicate: false };
  }

  async storedUpdateMatches(
    manager: EntityManager,
    updateId: string,
    encodedEnvelope: string,
  ): Promise<boolean> {
    const stored = await manager.findOneBy(MeetingDocumentUpdate, { id: updateId });
    if (!stored) return false;
    return stored.envelope.equals(this.decodeEnvelope(encodedEnvelope, 1_050_000));
  }

  async bootstrap(
    manager: EntityManager,
    user: User,
    meetingId: string,
  ) {
    this.assertContentUser(user);
    const document = await manager.findOne(MeetingDocument, { where: { meetingId } });
    if (!document?.activeSnapshotId) return null;
    const [snapshot, updates] = await Promise.all([
      manager.findOneByOrFail(MeetingDocumentSnapshot, { id: document.activeSnapshotId }),
      manager.find(MeetingDocumentUpdate, {
        where: { documentId: document.id, snapshotId: document.activeSnapshotId },
        order: { serverSequence: "ASC" },
      }),
    ]);
    const epochIds = [...new Set([snapshot.clientEpochId, ...updates.map((update) => update.clientEpochId)])];
    const epochs = await manager.find(E2eeClientEpoch, { where: { id: In(epochIds) } });
    const signingKeys = new Map(epochs.map((epoch) => [
      epoch.id,
      epoch.signingPublicKey.toString("base64url"),
    ]));
    return {
      meetingId,
      documentId: document.id,
      envelopeFormat: document.envelopeFormat,
      cryptoSuite: document.cryptoSuite,
      meetingCodec: document.meetingCodec,
      activeSnapshotId: document.activeSnapshotId,
      currentServerSequence: document.currentServerSequence,
      snapshot: {
        id: snapshot.id,
        clientEpochId: snapshot.clientEpochId,
        signingPublicKey: signingKeys.get(snapshot.clientEpochId),
        envelope: snapshot.envelope.toString("base64url"),
      },
      updates: updates.map((update) => ({
        id: update.id,
        clientEpochId: update.clientEpochId,
        signingPublicKey: signingKeys.get(update.clientEpochId),
        authorClock: update.authorClock,
        serverSequence: update.serverSequence,
        envelope: update.envelope.toString("base64url"),
      })),
    };
  }

  private async context(
    manager: EntityManager,
    user: User,
    clientEpochId: string,
  ): Promise<{ state: E2eeKeyState; epoch: E2eeClientEpoch }> {
    const [state, epoch] = await Promise.all([
      manager.findOne(E2eeKeyState, { where: { id: 1 } }),
      manager.findOne(E2eeClientEpoch, { where: { id: clientEpochId } }),
    ]);
    if (!state) {
      throw codedHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "E2EE_NOT_CONFIGURED",
        "Protected text is not configured",
      );
    }
    if (!epoch || epoch.revokedAt || epoch.userId !== user.id
      || epoch.organizationId !== state.organizationId) {
      throw codedHttpException(
        HttpStatus.CONFLICT,
        "E2EE_CLIENT_EPOCH_INVALID",
        "Client epoch is not active for this user",
      );
    }
    return { state, epoch };
  }

  private decodeEnvelope(value: string, maximum: number): Buffer {
    if (typeof value !== "string") this.invalidEnvelope();
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length === 0 || decoded.length > maximum || decoded.toString("base64url") !== value) {
      this.invalidEnvelope();
    }
    return decoded;
  }

  private invalidEnvelope(): never {
    throw codedHttpException(
      HttpStatus.BAD_REQUEST,
      "E2EE_ENVELOPE_INVALID",
      "Invalid encrypted Meeting document envelope",
    );
  }
}
