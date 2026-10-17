import { randomUUID } from "node:crypto";
import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { DataSource } from "typeorm";
import { E2eeKeyState } from "../src/e2ee/e2ee-key-state.entity";
import { E2eeClientEpoch } from "../src/e2ee/e2ee-client-epoch.entity";
import { MeetingsService } from "../src/meetings/meetings.service";
import { MeetingTopic } from "../src/meetings/meeting-topic.entity";
import { User } from "../src/users/user.entity";
import { mentionRecordId } from "../src/meetings/mention-completion";
import { CompletionSubmissionDto } from "../src/meetings/dto/completion.dto";

const encoder = new Encoder({ mapsAsObjects: false, useRecords: false, tagUint8Array: false });
const uuidBytes = (id: string) => Buffer.from(id.replaceAll("-", ""), "hex");

// Public-key-valid opaque envelopes exercise the server's validation boundary;
// browser codec tests separately prove encryption/decryption of the payload.
export async function completionFixture(database: DataSource, service: MeetingsService, user: User) {
  await sodium.ready;
  const organizationId = randomUUID();
  const ockId = randomUUID();
  const epochId = randomUUID();
  const signing = sodium.crypto_sign_keypair();
  const noncePrefix = Buffer.from(sodium.randombytes_buf(16));
  await database.getRepository(E2eeKeyState).save({
    id: 1, organizationId, ockId, orkId: randomUUID(), ockEpoch: 1, generation: 1,
    sharedPassphraseSlot: Buffer.from([1]), recoverySlot: Buffer.from([2]), contentKeyWrapper: Buffer.from([3]),
    custodyAcknowledgedBy: user.id, custodyAcknowledgedAt: new Date(),
  });
  await database.getRepository(E2eeClientEpoch).save({
    id: epochId, organizationId, userId: user.id, noncePrefix,
    signingPublicKey: Buffer.from(signing.publicKey), revokedAt: null,
  });
  let counter = 0;
  const envelope = (recordId: string, aggregateType = 261, fieldId = 1) => {
    const nonce = Buffer.alloc(24);
    nonce.set(noncePrefix); nonce.writeBigUInt64BE(BigInt(++counter), 16);
    const header = [uuidBytes(organizationId), aggregateType, uuidBytes(recordId), fieldId, uuidBytes(ockId), uuidBytes(epochId), counter, nonce];
    const ciphertext = Buffer.alloc(272, 23);
    const signature = sodium.crypto_sign_detached(Buffer.concat([
      Buffer.from("ElderFlow signed envelope v1\0"), Buffer.from(encoder.encode([1, 4, 1, header, ciphertext])),
    ]), signing.privateKey);
    return Buffer.from(encoder.encode([1, 4, 1, header, ciphertext, signature])).toString("base64url");
  };
  const prepare = async (meetingId: string, users: string[] = []): Promise<CompletionSubmissionDto> => {
    const claim = await service.prepareCompletion(meetingId, user, { proofEnvelope: envelope(meetingId, 261, 2) });
    const appearances = await database.getRepository(MeetingTopic).findBy({ meetingId });
    return { ...claim, proofEnvelope: envelope(claim.barrierId), appearances: appearances.map((appearance) => ({
      appearanceId: appearance.id,
      mentions: users.map((userId, occurrence) => {
        const id = mentionRecordId(claim.barrierId, appearance.id, userId, occurrence);
        return { id, userId, occurrence, contextEnvelope: envelope(id, 260) };
      }),
    })) };
  };
  return { envelope, prepare, epochId, complete: async (meetingId: string, users: string[] = []) =>
    service.complete(meetingId, user, await prepare(meetingId, users)) };
}
