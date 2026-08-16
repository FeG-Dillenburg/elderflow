import sodium from "libsodium-wrappers-sumo";
import * as Y from "yjs";
import {
  applyEncryptedMeetingSnapshot,
  applyEncryptedMeetingUpdate,
  createEncryptedMeetingSnapshot,
  createEncryptedMeetingUpdate,
  decryptEncryptedMeetingUpdate,
  meetingFragmentId,
  readMeetingFragment,
  replaceMeetingFragment,
  type StableMeetingFragment,
} from "./meeting-document-codec";
import { base64UrlToBytes, bytesToBase64Url } from "./protocol";
import { decryptMeetingAwareness, encryptMeetingAwareness } from "./meeting-awareness-codec";

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
    snapshotClock?: string;
    coveredAuthorClocks?: Array<[string, string]>;
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
  awarenessClock: number;
  snapshotClock: number;
  currentServerSequence: number;
  authorClocks: Map<string, number>;
  activeSnapshotEnvelope: Uint8Array;
}

export interface PendingEncryptedMeetingUpdate {
  envelope: string;
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
      awarenessClock: 0,
      snapshotClock: 1,
      currentServerSequence: 0,
      authorClocks: new Map(),
      activeSnapshotEnvelope: Uint8Array.from(envelope),
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
    const existing = this.documents.get(meetingId);
    const awarenessClock = existing?.documentId === workspace.documentId
      ? existing.awarenessClock
      : 0;
    existing?.document.destroy();
    this.documents.set(meetingId, {
      document,
      documentId: workspace.documentId,
      activeSnapshotId: workspace.activeSnapshotId,
      authorClock: Math.max(this.coveredClock(workspace), ...workspace.updates
        .filter((update) => update.clientEpochId === keys.clientEpochId)
        .map((update) => Number(update.authorClock))),
      awarenessClock,
      snapshotClock: workspace.snapshot.clientEpochId === keys.clientEpochId
        ? Number(workspace.snapshot.snapshotClock ?? 0)
        : 0,
      currentServerSequence: Number(workspace.currentServerSequence),
      authorClocks: this.workspaceAuthorClocks(workspace),
      activeSnapshotEnvelope: base64UrlToBytes(workspace.snapshot.envelope),
    });
    for (const prior of workspace.priorDocuments ?? []) {
      await this.load(`prior:${prior.documentId}`, prior);
    }
  }

  async merge(
    meetingId: string,
    workspace: EncryptedWorkspace,
    origin: unknown,
  ): Promise<{ parentChanged: boolean }> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    if (workspace.documentId !== loaded.documentId) {
      throw new Error("MEETING_WORKSPACE_UNAVAILABLE");
    }
    const parentChanged = workspace.activeSnapshotId !== loaded.activeSnapshotId;
    if (parentChanged) {
      await applyEncryptedMeetingSnapshot(loaded.document, {
        organizationId: keys.organizationId,
        documentId: workspace.documentId,
        snapshotId: workspace.snapshot.id,
        ockId: keys.ockId,
        clientEpochId: workspace.snapshot.clientEpochId,
        contentKey: keys.contentKey,
        signingPublicKey: base64UrlToBytes(workspace.snapshot.signingPublicKey),
        envelope: base64UrlToBytes(workspace.snapshot.envelope),
        origin,
      });
      loaded.activeSnapshotId = workspace.activeSnapshotId;
      loaded.activeSnapshotEnvelope = base64UrlToBytes(workspace.snapshot.envelope);
    }
    for (const update of workspace.updates) {
      await applyEncryptedMeetingUpdate(loaded.document, {
        organizationId: keys.organizationId,
        documentId: workspace.documentId,
        activeSnapshotId: workspace.activeSnapshotId,
        ockId: keys.ockId,
        clientEpochId: update.clientEpochId,
        authorClock: Number(update.authorClock),
        contentKey: keys.contentKey,
        signingPublicKey: base64UrlToBytes(update.signingPublicKey),
        envelope: base64UrlToBytes(update.envelope),
        origin,
      });
    }
    loaded.currentServerSequence = Number(workspace.currentServerSequence);
    loaded.authorClocks = this.workspaceAuthorClocks(workspace);
    loaded.authorClock = Math.max(
      this.coveredClock(workspace),
      loaded.authorClocks.get(keys.clientEpochId) ?? 0,
    );
    return { parentChanged };
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
    origin?: unknown,
  ): Promise<string> {
    this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    const update = replaceMeetingFragment(loaded.document, fragment, value, origin);
    return this.createDocumentUpdate(meetingId, update);
  }

  async createDocumentUpdate(meetingId: string, update: Uint8Array): Promise<string> {
    return (await this.createPendingDocumentUpdate(meetingId, update)).envelope;
  }

  async createPendingDocumentUpdate(
    meetingId: string,
    update: Uint8Array,
  ): Promise<PendingEncryptedMeetingUpdate> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    loaded.authorClock += 1;
    try {
      return {
        envelope: bytesToBase64Url(await createEncryptedMeetingUpdate({
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
        })),
        activeSnapshotId: loaded.activeSnapshotId,
        authorClock: loaded.authorClock,
      };
    } catch (error) {
      loaded.authorClock -= 1;
      throw error;
    }
  }

  async decryptPendingDocumentUpdate(
    meetingId: string,
    pending: PendingEncryptedMeetingUpdate,
  ): Promise<Uint8Array> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    return decryptEncryptedMeetingUpdate({
        organizationId: keys.organizationId,
        documentId: loaded.documentId,
        activeSnapshotId: pending.activeSnapshotId,
        ockId: keys.ockId,
        clientEpochId: keys.clientEpochId,
        authorClock: pending.authorClock,
        contentKey: keys.contentKey,
        signingPublicKey: sodium.crypto_sign_ed25519_sk_to_pk(keys.signingPrivateKey),
        envelope: base64UrlToBytes(pending.envelope),
      });
  }

  document(meetingId: string): Y.Doc {
    return this.requiredDocument(meetingId).document;
  }

  async applyRemoteUpdate(meetingId: string, input: {
    clientEpochId: string;
    authorClock: string;
    signingPublicKey: string;
    envelope: string;
    serverSequence?: string;
  }, origin: unknown): Promise<"applied" | "duplicate" | "gap"> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    if (input.serverSequence) {
      const sequence = Number(input.serverSequence);
      if (sequence <= loaded.currentServerSequence) return "duplicate";
      if (sequence !== loaded.currentServerSequence + 1) return "gap";
    }
    await applyEncryptedMeetingUpdate(loaded.document, {
      organizationId: keys.organizationId,
      documentId: loaded.documentId,
      activeSnapshotId: loaded.activeSnapshotId,
      ockId: keys.ockId,
      clientEpochId: input.clientEpochId,
      authorClock: Number(input.authorClock),
      contentKey: keys.contentKey,
      signingPublicKey: base64UrlToBytes(input.signingPublicKey),
      envelope: base64UrlToBytes(input.envelope),
      origin,
    });
    loaded.authorClocks.set(input.clientEpochId, Number(input.authorClock));
    if (input.serverSequence) loaded.currentServerSequence = Number(input.serverSequence);
    return "applied";
  }

  acknowledge(meetingId: string, clientEpochId: string, authorClock: string, serverSequence: string): void {
    const loaded = this.requiredDocument(meetingId);
    loaded.authorClocks.set(clientEpochId, Number(authorClock));
    loaded.currentServerSequence = Number(serverSequence);
  }

  async createCompaction(meetingId: string, fragments: StableMeetingFragment[]) {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    const snapshotId = crypto.randomUUID();
    loaded.snapshotClock += 1;
    const parentEnvelopeHash = new Uint8Array(await crypto.subtle.digest(
      "SHA-256",
      Uint8Array.from(loaded.activeSnapshotEnvelope).buffer,
    ));
    const document = this.compactionDocument(loaded.document, fragments);
    try {
      const envelope = await createEncryptedMeetingSnapshot({
        organizationId: keys.organizationId,
        documentId: loaded.documentId,
        snapshotId,
        parentSnapshotId: loaded.activeSnapshotId,
        parentEnvelopeHash,
        coveredServerSequence: loaded.currentServerSequence,
        coveredAuthorClocks: [...loaded.authorClocks],
        ockId: keys.ockId,
        clientEpochId: keys.clientEpochId,
        snapshotClock: loaded.snapshotClock,
        noncePrefix: keys.noncePrefix,
        contentKey: keys.contentKey,
        signingPrivateKey: keys.signingPrivateKey,
        document,
      });
      return { snapshotId, snapshotEnvelope: bytesToBase64Url(envelope) };
    } finally {
      document.destroy();
    }
  }

  async acceptCompaction(
    meetingId: string,
    snapshotId: string,
    snapshotEnvelope: string,
    origin: unknown,
  ): Promise<void> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    await applyEncryptedMeetingSnapshot(loaded.document, {
      organizationId: keys.organizationId,
      documentId: loaded.documentId,
      snapshotId,
      ockId: keys.ockId,
      clientEpochId: keys.clientEpochId,
      contentKey: keys.contentKey,
      signingPublicKey: sodium.crypto_sign_ed25519_sk_to_pk(keys.signingPrivateKey),
      envelope: base64UrlToBytes(snapshotEnvelope),
      origin,
    });
    loaded.activeSnapshotId = snapshotId;
    loaded.activeSnapshotEnvelope = base64UrlToBytes(snapshotEnvelope);
  }

  async encryptAwareness(meetingId: string, plaintext: Uint8Array): Promise<string> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    loaded.awarenessClock += 1;
    return bytesToBase64Url(await encryptMeetingAwareness({
      ...keys,
      documentId: loaded.documentId,
      awarenessClock: loaded.awarenessClock,
      plaintext,
    }));
  }

  async decryptAwareness(meetingId: string, input: {
    clientEpochId: string;
    awarenessClock: string;
    signingPublicKey: string;
    envelope: string;
  }): Promise<Uint8Array> {
    const keys = this.requiredKeys();
    const loaded = this.requiredDocument(meetingId);
    return decryptMeetingAwareness({
      ...keys,
      documentId: loaded.documentId,
      clientEpochId: input.clientEpochId,
      awarenessClock: Number(input.awarenessClock),
      signingPublicKey: base64UrlToBytes(input.signingPublicKey),
      envelope: base64UrlToBytes(input.envelope),
    });
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

  private coveredClock(workspace: EncryptedWorkspace): number {
    const keys = this.requiredKeys();
    return Number(workspace.snapshot.coveredAuthorClocks
      ?.find(([epochId]) => epochId === keys.clientEpochId)?.[1] ?? 0);
  }

  private workspaceAuthorClocks(workspace: EncryptedWorkspace): Map<string, number> {
    const clocks = new Map((workspace.snapshot.coveredAuthorClocks ?? []).map(
      ([epochId, clock]) => [epochId, Number(clock)],
    ));
    for (const update of workspace.updates) {
      clocks.set(update.clientEpochId, Math.max(
        clocks.get(update.clientEpochId) ?? 0,
        Number(update.authorClock),
      ));
    }
    return clocks;
  }

  private compactionDocument(
    source: Y.Doc,
    fragments: StableMeetingFragment[],
  ): Y.Doc {
    const compacted = new Y.Doc();
    Y.applyUpdateV2(compacted, Y.encodeStateAsUpdateV2(source));
    const retained = new Set<string>(fragments);
    for (const name of compacted.share.keys()) {
      const fragment = name.startsWith("tiptap:") ? name.slice(7) : name;
      if (retained.has(fragment)) continue;
      if (name.startsWith("tiptap:")) {
        const shared = compacted.getXmlFragment(name);
        if (shared.length) shared.delete(0, shared.length);
      } else {
        const shared = compacted.getText(name);
        if (shared.length) shared.delete(0, shared.length);
      }
    }
    return compacted;
  }
}

export const meetingDocumentSession = new MeetingDocumentSession();
