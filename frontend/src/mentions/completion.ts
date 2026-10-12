import { uuidToBytes } from "../e2ee/crypto";
import { request, type Meeting } from "../api/domain";
import { meetingDocumentSession } from "../e2ee/meeting-document-session";
import { meetingCollaboration } from "../e2ee/meeting-collaboration";
import { scalarSession } from "../e2ee/scalar-session";
import { SCALAR_AGGREGATES } from "../e2ee/scalar-registry";
import { bytesToBase64Url } from "../e2ee/protocol";
import { currentLanguage } from "../i18n";
import { extractMeetingMentions } from "./meeting-extraction";

interface CompletionClaim { barrierId: string; documentId: string; serverSequence: string }
export interface CompletionSubmission extends CompletionClaim {
  proofEnvelope: string;
  appearances: { appearanceId: string; mentions: { id: string; userId: string; occurrence: number; contextEnvelope: string }[] }[];
}

export async function mentionRecordId(barrierId: string, appearanceId: string, userId: string, occurrence: number): Promise<string> {
  const name = new TextEncoder().encode(JSON.stringify([appearanceId, userId, occurrence]));
  const input = new Uint8Array(16 + name.length);
  input.set(uuidToBytes(barrierId));
  input.set(name, 16);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function completeWithMentions<T>(meetingId: string, submit: (input: CompletionSubmission) => Promise<T>): Promise<T> {
  const assertUnlocked = () => {
    if (!scalarSession.isUnlocked()) throw new Error("E2EE_PROTECTED_TEXT_LOCKED");
  };
  assertUnlocked();
  const proofEnvelope = bytesToBase64Url(await scalarSession.encrypt({
    aggregateType: SCALAR_AGGREGATES.completion, recordId: meetingId, fieldId: 2,
  }, null));
  const claim = await request<CompletionClaim>(`/api/meetings/${meetingId}/completion/prepare`, {
    method: "POST", body: JSON.stringify({ proofEnvelope }),
  });
  try {
    assertUnlocked();
    const provider = meetingCollaboration.get(meetingId);
    if (!provider?.isConnected() || !provider.isEditingPaused()
      || meetingDocumentSession.serverSequence(meetingId) !== claim.serverSequence) {
      throw new Error("MEETING_COMPLETION_RETRY");
    }
    // The barrier freezes both structure and text throughout this read/extract/submit stage.
    const meeting = await request<Meeting>(`/api/meetings/${meetingId}`);
    const document = meetingDocumentSession.document(meetingId);
    const appearances: CompletionSubmission["appearances"] = [];
    for (const appearance of extractMeetingMentions(document, meeting.agenda ?? [], currentLanguage())) {
      const mentions = [];
      for (const mention of appearance.mentions) {
        const id = await mentionRecordId(claim.barrierId, appearance.appearanceId, mention.userId, mention.occurrence);
        const envelope = await scalarSession.encrypt({ aggregateType: SCALAR_AGGREGATES.mention, recordId: id, fieldId: 1 },
          JSON.stringify({ meetingId, documentId: claim.documentId, serverSequence: claim.serverSequence,
            appearanceId: appearance.appearanceId, context: mention.context }));
        mentions.push({ id, userId: mention.userId, occurrence: mention.occurrence, contextEnvelope: bytesToBase64Url(envelope) });
      }
      appearances.push({ appearanceId: appearance.appearanceId, mentions });
    }
    const finalProof = bytesToBase64Url(await scalarSession.encrypt({
      aggregateType: SCALAR_AGGREGATES.completion, recordId: claim.barrierId, fieldId: 1,
    }, JSON.stringify({ meetingId, ...claim })));
    assertUnlocked();
    if (!provider.isConnected() || meetingDocumentSession.serverSequence(meetingId) !== claim.serverSequence) {
      throw new Error("MEETING_COMPLETION_RETRY");
    }
    return await submit({ ...claim, appearances, proofEnvelope: finalProof });
  } catch (error) {
    await request(`/api/meetings/${meetingId}/completion/${claim.barrierId}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}
