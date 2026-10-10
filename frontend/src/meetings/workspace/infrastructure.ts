import {
  apiWebSocketUrl,
  request,
  requestWithBinaryBody,
  type Meeting,
} from "../../api/domain";
import {
  meetingDocumentSession,
  type EncryptedWorkspace,
} from "../../e2ee/meeting-document-session";
import {
  MEETING_COLLABORATION_ORIGIN,
  meetingCollaboration,
  type CollaborationTicket,
} from "../../e2ee/meeting-collaboration";
import { base64UrlToBytes } from "../../e2ee/protocol";
import { scalarSession } from "../../e2ee/scalar-session";
import type { MeetingTextTarget } from "./core";
import { fragmentForMeetingTextTarget } from "./editor-binding";

const recoverWorkspace = async (meetingId: string): Promise<void> => {
  try {
    const workspace = await request<EncryptedWorkspace | null>(
      `/api/meetings/${meetingId}/workspace`,
    );
    if (workspace) await meetingDocumentSession.load(meetingId, workspace);
    else meetingDocumentSession.discard(meetingId);
  } catch {
    meetingDocumentSession.discard(meetingId);
  }
};

const appendUpdate = async (
  meetingId: string,
  envelope: string,
  appearanceId?: string,
): Promise<void> => {
  try {
    await requestWithBinaryBody(
      `/api/meetings/${meetingId}/workspace/updates`,
      base64UrlToBytes(envelope),
      appearanceId ? { "X-ElderFlow-Appearance-Id": appearanceId } : {},
    );
  } catch (error) {
    await recoverWorkspace(meetingId);
    throw error;
  }
};

const compactWorkspace = async (
  meetingId: string,
  barrierId: string,
  serverSequence: string,
  stableDocumentState: Uint8Array,
): Promise<void> => {
  const snapshot = await meetingDocumentSession.createCompaction(
    meetingId,
    Number(serverSequence),
    stableDocumentState,
  );
  await requestWithBinaryBody(
    `/api/meetings/${meetingId}/workspace/compact`,
    base64UrlToBytes(snapshot.snapshotEnvelope),
    {
      "X-ElderFlow-Snapshot-Id": snapshot.snapshotId,
      "X-ElderFlow-Compaction-Barrier-Id": barrierId,
    },
  );
  await meetingDocumentSession.acceptCompaction(
    meetingId,
    snapshot.snapshotId,
    snapshot.snapshotEnvelope,
    MEETING_COLLABORATION_ORIGIN,
  );
};

export const startMeetingCollaboration = async (meeting: Meeting): Promise<void> => {
  const id = meeting.id;
  if (!meeting.workspace || meeting.status === "completed" || !scalarSession.isUnlocked()
    || meetingCollaboration.get(id)) return;
  await meetingCollaboration.start(
    id,
    () => request<CollaborationTicket>(`/api/meetings/${id}/collaboration-ticket`, { method: "POST" }),
    (path) => new WebSocket(apiWebSocketUrl(path)),
    (barrierId, serverSequence, stableDocumentState) => compactWorkspace(
      id,
      barrierId,
      serverSequence,
      stableDocumentState,
    ),
    async () => {
      const workspace = await request<EncryptedWorkspace | null>(`/api/meetings/${id}/workspace`);
      if (!workspace) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
      const canonicalState = await meetingDocumentSession.canonicalDocumentState(workspace);
      try {
        return {
          ...await meetingDocumentSession.merge(id, workspace, MEETING_COLLABORATION_ORIGIN),
          canonicalState,
        };
      } catch (error) {
        canonicalState.fill(0);
        throw error;
      }
    },
  );
};

export const updateMeetingText = async (
  meetingId: string,
  target: MeetingTextTarget,
  value: string,
): Promise<void> => {
  const fragment = fragmentForMeetingTextTarget(target);
  if (meetingCollaboration.get(meetingId)) {
    meetingDocumentSession.updateFragment(meetingId, fragment, value);
    return;
  }
  const envelope = await meetingDocumentSession.createFragmentUpdate(meetingId, fragment, value);
  await appendUpdate(
    meetingId,
    envelope,
    "appearanceId" in target ? target.appearanceId : undefined,
  );
};
