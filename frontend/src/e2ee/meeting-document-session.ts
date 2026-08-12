import sodium from "libsodium-wrappers-sumo";
import * as Y from "yjs";
import {
  applyEncryptedMeetingSnapshot,
  applyEncryptedMeetingUpdate,
  createEncryptedMeetingSnapshot,
  createEncryptedMeetingUpdate,
  meetingFragmentId,
  readMeetingFragment,
  replaceMeetingFragment,
  type StableMeetingFragment,
} from "./meeting-document-codec";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";

interface DocumentSessionKeys {
  organizationId: string;
  ockId: string;
  clientEpochId: string;
  noncePrefix: Uint8Array;
  contentKey: Uint8Array;
  signingPrivateKey: Uint8Array;
}

export interface EncryptedWorkspace {
  documentId: string;
  activeSnapshotId: string;
  currentServerSequence: string;
  snapshot: {
    id: string;
    clientEpochId: string;
    signingPublicKey: string;
    envelope: string;
  };
  updates: Array<{
    clientEpochId: string;
    authorClock: string;
    signingPublicKey: string;
    envelope: string;
  }>;
  priorDocuments?: EncryptedWorkspace[];
}

interface LoadedDocument {
  document: Y.Doc;
  documentId: string;
  activeSnapshotId: string;
  authorClock: number;
}

export class MeetingDocumentSession {
  private keys: DocumentSessionKeys | null = null;
  private documents = new Map<string, LoadedDocument>();

  unlock(keys: DocumentSessionKeys): void {
    this.lock();
    this.keys = {
      ...keys,
      noncePrefix: Uint8Array.from(keys.noncePrefix),
      contentKey: Uint8Array.from(keys.contentKey),
      signingPrivateKey: Uint8Array.from(keys.signingPrivateKey),
    };
  }

  async createInitial(meetingId: string) {
    const keys = this.requiredKeys();
    const documentId = crypto.randomUUID();
    const snapshotId = crypto.randomUUID();
    const document = new Y.Doc();
    replaceMeetingFragment(document, "meeting/general-notes", "");
    replaceMeetingFragment(document, "meeting/opening-input", "");
    const envelope = await createEncryptedMeetingSnapshot({
      organizationId: keys.organizationId,
      documentId,
      snapshotId,
      parentSnapshotId: "00000000-0000-0000-0000-000000000000",
      parentEnvelopeHash: new Uint8Array(32),
      coveredServerSequence: 0,
      coveredAuthorClocks: [],
      ockId: keys.ockId,
      clientEpochId: keys.clientEpochId,
      snapshotClock: 1,
      noncePrefix: keys.noncePrefix,
      contentKey: keys.contentKey,
      signingPrivateKey: keys.signingPrivateKey,
      document,
    });
    this.documents.set(meetingId, {
      document,
      documentId,
      activeSnapshotId: snapshotId,
      authorClock: 0,
    });
    return { documentId, snapshotId, snapshotEnvelope: bytesToBase64Url(envelope) };
  }

  async load(meetingId: string, workspace: EncryptedWorkspace): Promise<void> {
    const keys = this.requiredKeys();
    const document = new Y.Doc();
    await applyEncryptedMeetingSnapshot(document, {
      organizationId: keys.organizationId,
      documentId: workspace.documentId,
      snapshotId: workspace.snapshot.id,
      ockId: keys.ockId,
      clientEpochId: workspace.snapshot.clientEpochId,
      contentKey: keys.contentKey,
      signingPublicKey: base64UrlToBytes(workspace.snapshot.signingPublicKey),
      envelope: base64UrlToBytes(workspace.snapshot.envelope),
    });
    for (const update of workspace.updates) {
      await applyEncryptedMeetingUpdate(document, {
        organizationId: keys.organizationId,
        documentId: workspace.documentId,
        activeSnapshotId: workspace.activeSnapshotId,
        ockId: keys.ockId,
        clientEpochId: update.clientEpochId,
        authorClock: Number(update.authorClock),
        contentKey: keys.contentKey,
        signingPublicKey: base64UrlToBytes(update.signingPublicKey),
        envelope: base64UrlToBytes(update.envelope),
      });
    }
    this.documents.get(meetingId)?.document.destroy();
    this.documents.set(meetingId, {
      document,
      documentId: workspace.documentId,
      activeSnapshotId: workspace.activeSnapshotId,
      authorClock: Math.max(0, ...workspace.updates
        .filter((update) => update.clientEpochId === keys.clientEpochId)
        .map((update) => Number(update.authorClock))),
    });
    for (const prior of workspace.priorDocuments ?? []) {
      await this.load(`prior:${prior.documentId}`, prior);
    }
  }

  hydrateFragments(meetingId: string, appearanceIds: Array<{ id: string; person: boolean }>) {
    const loaded = this.requiredDocument(meetingId);
    return {
      generalNotes: readMeetingFragment(loaded.document, "meeting/general-notes"),
      openingInput: readMeetingFragment(loaded.document, "meeting/opening-input"),
      appearances: new Map(appearanceIds.map(({ id, person }) => [id, person
        ? {
            preparationContext: null,
            personNote: readMeetingFragment(loaded.document, meetingFragmentId("personNote", id)),
            meetingMinutes: null,
          }
        : {
            preparationContext: readMeetingFragment(
              loaded.document,
              meetingFragmentId("preparationContext", id),
            ),
            personNote: null,
            meetingMinutes: readMeetingFragment(
              loaded.document,
              meetingFragmentId("meetingMinutes", id),
            ),
          }])),
    };
  }

  async createFragmentUpdate(
    meetingId: string,
    fragment: StableMeetingFragment,
    value: string,
  ): Promise<string> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    const update = replaceMeetingFragment(loaded.document, fragment, value);
    loaded.authorClock += 1;
    try {
      return bytesToBase64Url(await createEncryptedMeetingUpdate({
        organizationId: keys.organizationId,
        documentId: loaded.documentId,
        activeSnapshotId: loaded.activeSnapshotId,
        ockId: keys.ockId,
        clientEpochId: keys.clientEpochId,
        authorClock: loaded.authorClock,
        noncePrefix: keys.noncePrefix,
        contentKey: keys.contentKey,
        signingPrivateKey: keys.signingPrivateKey,
        update,
      }));
    } catch (error) {
      loaded.authorClock -= 1;
      throw error;
    }
  }

  readPriorFragment(documentId: string, fragment: StableMeetingFragment): string {
    return readMeetingFragment(this.requiredDocument(`prior:${documentId}`).document, fragment);
  }

  lock(): void {
    for (const loaded of this.documents.values()) loaded.document.destroy();
    this.documents.clear();
    if (this.keys) {
      sodium.memzero(this.keys.noncePrefix);
      sodium.memzero(this.keys.contentKey);
      sodium.memzero(this.keys.signingPrivateKey);
    }
    this.keys = null;
  }

  discard(meetingId: string): void {
    this.documents.get(meetingId)?.document.destroy();
    this.documents.delete(meetingId);
  }

  private requiredKeys(): DocumentSessionKeys {
    if (!this.keys) throw new Error("E2EE_PROTECTED_TEXT_LOCKED");
    return this.keys;
  }

  private requiredDocument(meetingId: string): LoadedDocument {
    const loaded = this.documents.get(meetingId);
    if (!loaded) throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
    return loaded;
  }
}

export const meetingDocumentSession = new MeetingDocumentSession();
