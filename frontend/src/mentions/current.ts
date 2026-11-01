import { request } from "../api/domain";
import { base64UrlToBytes } from "../e2ee/protocol";
import { scalarSession } from "../e2ee/scalar-session";
import { SCALAR_AGGREGATES } from "../e2ee/scalar-registry";

export interface CurrentMention {
  id: string;
  appearanceId: string;
  topicId: string;
  meetingId: string;
  date: string;
  topicName: string;
  meetingTitle: string;
  context: string;
}
interface EncryptedMention extends Omit<CurrentMention, "topicName" | "meetingTitle" | "context"> {
  contextEnvelope: string;
  topicNameEnvelope: string | null;
  meetingTitleEnvelope: string;
}
export async function currentMentions(signal?: AbortSignal, limit?: number): Promise<CurrentMention[]> {
  if (!scalarSession.isUnlocked()) throw new Error("E2EE_PROTECTED_TEXT_LOCKED");
  const rows = await request<EncryptedMention[]>(`/api/meetings/my-mentions${limit === undefined ? "" : `?limit=${limit}`}`, { signal });
  signal?.throwIfAborted();
  const decrypted = await Promise.all(rows.map(async (row) => {
    signal?.throwIfAborted();
    const context = JSON.parse(await scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.mention, recordId: row.id, fieldId: 1,
    }, base64UrlToBytes(row.contextEnvelope)) ?? "null");
    if (!context || context.meetingId !== row.meetingId || context.appearanceId !== row.appearanceId
      || typeof context.context !== "string") throw new Error("E2EE_SCALAR_CONTEXT_INVALID");
    const topicName = row.topicNameEnvelope ? await scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.topic, recordId: row.topicId, fieldId: 1,
    }, base64UrlToBytes(row.topicNameEnvelope)) : null;
    const meetingTitle = await scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.meeting, recordId: row.meetingId, fieldId: 1,
    }, base64UrlToBytes(row.meetingTitleEnvelope));
    signal?.throwIfAborted();
    return {
      id: row.id, appearanceId: row.appearanceId, topicId: row.topicId, meetingId: row.meetingId, date: row.date,
      topicName: topicName ?? "", meetingTitle: meetingTitle ?? "", context: context.context,
    };
  }));
  signal?.throwIfAborted();
  return decrypted;
}
