/**
 * PROTOTYPE — disposable evidence for GitHub issue "Prototype the opaque
 * encrypted Meeting-document protocol". This is deliberately not production
 * cryptography, persistence, authorization, or collaboration code.
 *
 * Question: can one encrypted Yjs document per Meeting, using stable semantic
 * fragments and a Secsync-style opaque relay, preserve ElderFlow's domain
 * boundaries under reconnect, adversarial delivery, snapshot, and completion
 * races? The model uses real Yjs updates and Secsync 0.5.0 envelopes while the
 * relay is an in-memory structural state machine that never receives a key.
 */
import sodium from 'libsodium-wrappers';
import {
  createInitialSnapshot,
  createSignatureKeyPair,
  createSnapshot,
  createUpdate,
  hash,
  type Snapshot,
  type Update,
  verifyAndDecryptSnapshot,
  verifyAndDecryptUpdate,
} from 'secsync';
import * as Y from 'yjs';

export type MeetingStatus = 'planned' | 'in_progress' | 'completed';
export type ClientRole = 'admin' | 'user' | 'guest' | 'it-admin';

export type StableFragment =
  | 'meeting/general-notes'
  | 'meeting/opening-input'
  | `appearance/${string}/preparation-context`
  | `appearance/${string}/person-note`
  | `appearance/${string}/minutes`;

export interface VisibleClientState {
  connected: boolean;
  pending: number;
  discardedAfterCompletion: number;
  lastError: string | null;
  fragments: Record<string, string>;
}

export interface VisibleLabState {
  question: string;
  meeting: {
    documentId: string;
    status: MeetingStatus;
    appearances: string[];
  };
  relay: {
    knowsKey: false;
    activeSnapshotId: string;
    persistedUpdates: number;
    encryptedEphemeralRelays: number;
    loggedPayloads: 0;
    metadataLog: string[];
  };
  clients: Record<string, VisibleClientState>;
  observations: string[];
}

interface Client {
  id: string;
  role: ClientRole;
  doc: Y.Doc;
  signingKeys: ReturnType<typeof createSignatureKeyPair>;
  clock: number;
  connected: boolean;
  pending: Update[];
  discardedAfterCompletion: number;
  knownClocks: Map<string, number>;
  lastError: string | null;
}

interface AcceptedUpdate {
  update: Update;
  serverSequence: number;
}

interface SnapshotRecord {
  snapshot: Snapshot;
  updateClocks: Record<string, number>;
}

interface MutationResult {
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
}

const DOCUMENT_ID = 'meeting:prototype-41';
const INITIAL_SNAPSHOT_ID = 'snapshot:initial';
const ROOT_PARENT_ID = 'snapshot:root';

const fragmentText = (doc: Y.Doc, name: string): string => doc.getXmlFragment(name).toString();

const replaceFragment = (doc: Y.Doc, name: StableFragment, value: string, origin: string): Uint8Array => {
  let captured: Uint8Array | undefined;
  const listener = (update: Uint8Array, eventOrigin: unknown): void => {
    if (eventOrigin === origin) captured = update;
  };
  doc.on('updateV2', listener);
  doc.transact(() => {
    const fragment = doc.getXmlFragment(name);
    if (fragment.length > 0) fragment.delete(0, fragment.length);
    const paragraph = new Y.XmlElement('p');
    const text = new Y.XmlText();
    text.insert(0, value);
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);
  }, origin);
  doc.off('updateV2', listener);
  if (!captured) throw new Error('Yjs emitted no update for the local edit');
  return captured;
};

const publicKey = (client: Client): string => sodium.to_base64(client.signingKeys.publicKey);

export class OpaqueMeetingProtocolLab {
  private readonly key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  private readonly clients = new Map<string, Client>();
  private readonly updates: AcceptedUpdate[] = [];
  private readonly authorClocks = new Map<string, number>();
  private readonly metadataLog: string[] = [];
  private readonly observations: string[] = [];
  private readonly appearances = new Set(['appearance-a', 'appearance-person']);
  private readonly mutationResults = new Map<string, MutationResult>();
  private activeSnapshot: SnapshotRecord;
  private status: MeetingStatus = 'in_progress';
  private serverSequence = 0;
  private encryptedEphemeralRelays = 0;

  private constructor(initialSnapshot: Snapshot) {
    this.activeSnapshot = { snapshot: initialSnapshot, updateClocks: {} };
  }

  static async create(): Promise<OpaqueMeetingProtocolLab> {
    await sodium.ready;
    const seedDoc = new Y.Doc();
    replaceFragment(seedDoc, 'meeting/general-notes', 'Initial general notes', 'seed');
    replaceFragment(seedDoc, 'meeting/opening-input', 'Initial opening input', 'seed');
    replaceFragment(seedDoc, 'appearance/appearance-a/preparation-context', 'Prepared context', 'seed');
    replaceFragment(seedDoc, 'appearance/appearance-a/minutes', '', 'seed');
    replaceFragment(seedDoc, 'appearance/appearance-person/person-note', 'Earlier person note', 'seed');

    const signingKeys = createSignatureKeyPair(sodium);
    const initialSnapshot = createInitialSnapshot(
      Y.encodeStateAsUpdateV2(seedDoc),
      {
        docId: DOCUMENT_ID,
        pubKey: sodium.to_base64(signingKeys.publicKey),
        snapshotId: INITIAL_SNAPSHOT_ID,
        parentSnapshotId: ROOT_PARENT_ID,
        parentSnapshotUpdateClocks: {},
      },
      sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES),
      signingKeys,
      sodium,
    );

    // Replace the throwaway key used above with one shared by all prototype
    // Content clients. Re-encrypting here keeps the constructor synchronous.
    const lab = new OpaqueMeetingProtocolLab(initialSnapshot);
    lab.activeSnapshot = {
      snapshot: createInitialSnapshot(
        Y.encodeStateAsUpdateV2(seedDoc),
        {
          docId: DOCUMENT_ID,
          pubKey: sodium.to_base64(signingKeys.publicKey),
          snapshotId: INITIAL_SNAPSHOT_ID,
          parentSnapshotId: ROOT_PARENT_ID,
          parentSnapshotUpdateClocks: {},
        },
        lab.key,
        signingKeys,
        sodium,
      ),
      updateClocks: {},
    };
    lab.addClient('alice', 'admin');
    lab.addClient('bob', 'user');
    lab.addClient('viewer', 'guest');
    lab.addClient('ops', 'it-admin');
    return lab;
  }

  private addClient(id: string, role: ClientRole): void {
    const client: Client = {
      id,
      role,
      doc: new Y.Doc(),
      signingKeys: createSignatureKeyPair(sodium),
      clock: 0,
      connected: role !== 'it-admin',
      pending: [],
      discardedAfterCompletion: 0,
      knownClocks: new Map(),
      lastError: null,
    };
    this.clients.set(id, client);
    if (role !== 'it-admin') this.bootstrap(client);
  }

  private bootstrap(client: Client): void {
    if (client.role === 'it-admin') {
      client.lastError = 'IT_ADMIN_UNLOCK_FORBIDDEN';
      return;
    }
    const opened = verifyAndDecryptSnapshot(
      this.activeSnapshot.snapshot,
      this.key,
      DOCUMENT_ID,
      client.signingKeys.publicKey,
      sodium,
    );
    if (opened.error) throw opened.error;
    Y.applyUpdateV2(client.doc, opened.content, 'remote');
    client.knownClocks.clear();
    for (const accepted of this.updates) this.applyRemote(client, accepted.update);
  }

  private canWrite(client: Client): boolean {
    return client.role === 'admin' || client.role === 'user';
  }

  private persist(client: Client, update: Update): MutationResult {
    if (!this.canWrite(client)) return { status: 'rejected', reason: 'MEETING_WRITE_FORBIDDEN' };
    if (this.status === 'completed') return { status: 'rejected', reason: 'MEETING_COMPLETED_IMMUTABLE' };
    if (update.publicData.docId !== DOCUMENT_ID) return { status: 'rejected', reason: 'DOCUMENT_MISMATCH' };
    if (update.publicData.refSnapshotId !== this.activeSnapshot.snapshot.publicData.snapshotId) {
      return { status: 'rejected', reason: 'STALE_SNAPSHOT' };
    }
    const author = update.publicData.pubKey;
    const knownClock = this.authorClocks.get(author) ?? 0;
    if (update.publicData.clock === knownClock) {
      const duplicate = this.updates.find((candidate) =>
        candidate.update.publicData.pubKey === author && candidate.update.publicData.clock === knownClock);
      return duplicate?.update.ciphertext === update.ciphertext
        ? { status: 'duplicate' }
        : { status: 'rejected', reason: 'CLOCK_REUSE_WITH_DIFFERENT_CIPHERTEXT' };
    }
    if (update.publicData.clock !== knownClock + 1) return { status: 'rejected', reason: 'AUTHOR_CLOCK_GAP' };

    this.authorClocks.set(author, update.publicData.clock);
    this.serverSequence += 1;
    this.updates.push({ update, serverSequence: this.serverSequence });
    this.metadataLog.push(`update seq=${this.serverSequence} author=${author.slice(0, 8)} clock=${update.publicData.clock} bytes=${update.ciphertext.length}`);
    for (const recipient of this.clients.values()) {
      if (recipient.id !== client.id && recipient.connected && recipient.role !== 'it-admin') {
        this.applyRemote(recipient, update);
      }
    }
    return { status: 'accepted' };
  }

  private applyRemote(client: Client, update: Update): void {
    const author = update.publicData.pubKey;
    const currentClock = client.knownClocks.get(author) ?? 0;
    const opened = verifyAndDecryptUpdate(
      update,
      this.key,
      this.activeSnapshot.snapshot.publicData.snapshotId,
      currentClock,
      sodium,
    );
    if (opened.error) {
      client.lastError = opened.error.message;
      return;
    }
    Y.applyUpdateV2(client.doc, opened.content, 'remote');
    client.knownClocks.set(author, opened.clock);
    client.lastError = null;
  }

  edit(clientId: string, fragment: StableFragment, value: string): MutationResult {
    const client = this.client(clientId);
    if (!this.canWrite(client)) {
      client.lastError = 'MEETING_WRITE_FORBIDDEN';
      return { status: 'rejected', reason: client.lastError };
    }
    const yUpdate = replaceFragment(client.doc, fragment, value, `local:${client.id}`);
    client.clock += 1;
    const envelope = createUpdate(
      yUpdate,
      {
        docId: DOCUMENT_ID,
        pubKey: publicKey(client),
        refSnapshotId: this.activeSnapshot.snapshot.publicData.snapshotId,
      },
      this.key,
      client.signingKeys,
      client.clock,
      sodium,
    );
    if (!client.connected) {
      client.pending.push(envelope);
      client.lastError = 'ENCRYPTED_UPDATE_PENDING';
      return { status: 'accepted', reason: 'queued-as-ciphertext' };
    }
    const result = this.persist(client, envelope);
    client.lastError = result.reason ?? null;
    if (result.status === 'rejected') client.pending.push(envelope);
    else client.knownClocks.set(publicKey(client), client.clock);
    return result;
  }

  setConnected(clientId: string, connected: boolean): void {
    const client = this.client(clientId);
    client.connected = connected;
    if (connected) this.reconnect(clientId);
  }

  reconnect(clientId: string): void {
    const client = this.client(clientId);
    client.connected = true;
    const missing = this.updates.filter(({ update }) =>
      update.publicData.clock > (client.knownClocks.get(update.publicData.pubKey) ?? 0));
    for (const accepted of missing) this.applyRemote(client, accepted.update);
    const pending = [...client.pending];
    client.pending = [];
    for (const envelope of pending) {
      const result = this.persist(client, envelope);
      if (result.status === 'rejected') {
        if (result.reason === 'MEETING_COMPLETED_IMMUTABLE') {
          client.discardedAfterCompletion += 1;
          client.doc.destroy();
          client.doc = new Y.Doc();
          this.bootstrap(client);
          client.lastError = 'PENDING_UPDATE_DISCARDED_AFTER_COMPLETION';
        } else {
          client.pending.push(envelope);
          client.lastError = result.reason ?? 'REJECTED';
        }
      } else {
        client.knownClocks.set(publicKey(client), envelope.publicData.clock);
        client.lastError = null;
      }
    }
  }

  addAppearanceMutation(
    clientId: string,
    mutationId: string,
    appearanceId: string,
    role: 'preparation-context' | 'person-note',
    initialText: string,
  ): MutationResult {
    const previous = this.mutationResults.get(mutationId);
    if (previous) return { ...previous, status: previous.status === 'accepted' ? 'duplicate' : previous.status };
    if (this.appearances.has(appearanceId)) return { status: 'rejected', reason: 'APPEARANCE_ALREADY_EXISTS' };
    const client = this.client(clientId);
    if (!client.connected || !this.canWrite(client) || this.status === 'completed') {
      return { status: 'rejected', reason: 'STRUCTURAL_CONTENT_MUTATION_REJECTED' };
    }

    // Prototype transaction: prepare the encrypted update before the relay
    // commits either the structural appearance or the opaque envelope.
    const fragment = `appearance/${appearanceId}/${role}` as StableFragment;
    const result = this.edit(clientId, fragment, initialText);
    if (result.status === 'accepted' || result.status === 'duplicate') this.appearances.add(appearanceId);
    this.mutationResults.set(mutationId, result);
    return result;
  }

  copyForward(
    clientId: string,
    source: StableFragment,
    targetAppearanceId: string,
    targetRole: 'preparation-context' | 'person-note',
  ): MutationResult {
    const client = this.client(clientId);
    const sourceText = fragmentText(client.doc, source).replace(/^<p>|<\/p>$/g, '');
    return this.addAppearanceMutation(
      clientId,
      `copy:${targetAppearanceId}`,
      targetAppearanceId,
      targetRole,
      sourceText,
    );
  }

  sendAwareness(clientId: string, field: StableFragment): MutationResult {
    const client = this.client(clientId);
    if (!client.connected || client.role === 'it-admin') return { status: 'rejected', reason: 'AWARENESS_FORBIDDEN' };
    // The payload is encrypted in the real Secsync ephemeral envelope. The lab
    // intentionally exposes to the relay only bytes and routing metadata.
    const plaintext = JSON.stringify({ displayName: client.id, field, cursor: 3 });
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      DOCUMENT_ID,
      null,
      nonce,
      this.key,
    );
    this.encryptedEphemeralRelays += 1;
    this.metadataLog.push(`ephemeral author=${client.id} bytes=${ciphertext.length}`);
    return { status: 'accepted' };
  }

  corruptLastDelivery(recipientId: string): string {
    const last = this.updates[this.updates.length - 1]?.update;
    if (!last) return 'no update to corrupt';
    const corrupted: Update = { ...last, ciphertext: `${last.ciphertext.slice(0, -2)}AA` };
    this.applyRemote(this.client(recipientId), corrupted);
    const error = this.client(recipientId).lastError ?? 'corruption was not detected';
    this.observations.unshift(`Corruption drill: ${error}`);
    return error;
  }

  replayLastDelivery(recipientId: string): string {
    const last = this.updates[this.updates.length - 1]?.update;
    if (!last) return 'no update to replay';
    this.applyRemote(this.client(recipientId), last);
    const error = this.client(recipientId).lastError ?? 'replay was not detected';
    this.observations.unshift(`Replay drill: ${error}`);
    return error;
  }

  detectOmittedAuthorUpdate(): string {
    const byAuthor = new Map<string, Update[]>();
    for (const { update } of this.updates) {
      const authorUpdates = byAuthor.get(update.publicData.pubKey) ?? [];
      authorUpdates.push(update);
      byAuthor.set(update.publicData.pubKey, authorUpdates);
    }
    const second = [...byAuthor.values()].find((updates) => updates.length >= 2)?.[1];
    if (!second) return 'not-enough-same-author-updates';
    const opened = verifyAndDecryptUpdate(
      second,
      this.key,
      this.activeSnapshot.snapshot.publicData.snapshotId,
      0,
      sodium,
    );
    return opened.error?.message ?? 'omission-was-not-detected';
  }

  verifyAuthorSeparation(): string {
    const nonces = new Set(this.updates.map(({ update }) => update.nonce));
    const firstClockByAuthor = new Map<string, number>();
    for (const { update } of this.updates) {
      if (!firstClockByAuthor.has(update.publicData.pubKey)) {
        firstClockByAuthor.set(update.publicData.pubKey, update.publicData.clock);
      }
    }
    const uniqueNonces = nonces.size === this.updates.length;
    const independentClocks = firstClockByAuthor.size >= 2 &&
      [...firstClockByAuthor.values()].every((clock) => clock === 1);
    return uniqueNonces && independentClocks
      ? `${nonces.size} unique nonces; ${firstClockByAuthor.size} authors each start at clock 1`
      : 'nonce-or-author-clock-separation-failed';
  }

  removeAppearance(appearanceId: string): void {
    this.appearances.delete(appearanceId);
    this.metadataLog.push(`appearance removed id=${appearanceId}; opaque fragment becomes non-renderable`);
  }

  purgeOrphanFragment(clientId: string, appearanceId: string, role: 'preparation-context' | 'person-note' | 'minutes'): MutationResult {
    if (this.appearances.has(appearanceId)) return { status: 'rejected', reason: 'APPEARANCE_STILL_ACTIVE' };
    return this.edit(clientId, `appearance/${appearanceId}/${role}`, '');
  }

  raceClientSnapshots(firstClientId: string, secondClientId: string): string {
    const first = this.client(firstClientId);
    const second = this.client(secondClientId);
    const parent = this.activeSnapshot;
    const clocks = Object.fromEntries(this.authorClocks.entries());
    const candidate = (client: Client, snapshotId: string): Snapshot => createSnapshot(
      Y.encodeStateAsUpdateV2(client.doc),
      {
        docId: DOCUMENT_ID,
        pubKey: publicKey(client),
        snapshotId,
        parentSnapshotId: parent.snapshot.publicData.snapshotId,
        parentSnapshotUpdateClocks: clocks,
      },
      this.key,
      client.signingKeys,
      hash(parent.snapshot.ciphertext, sodium),
      parent.snapshot.publicData.parentSnapshotProof,
      sodium,
    );
    const winner = candidate(first, 'snapshot:race-winner');
    const loser = candidate(second, 'snapshot:race-loser');
    this.activeSnapshot = { snapshot: winner, updateClocks: clocks };
    this.updates.length = 0;
    const rejected = loser.publicData.parentSnapshotId !== this.activeSnapshot.snapshot.publicData.snapshotId;
    this.metadataLog.push(`snapshot race winner=${firstClientId} loser=${secondClientId} stale-parent-rejected=${rejected}`);
    return rejected ? 'second proposal rejected because its parent is no longer active' : 'concurrent snapshot was not rejected';
  }

  createClientSnapshot(clientId: string, snapshotId: string): MutationResult {
    const client = this.client(clientId);
    if (!client.connected || !this.canWrite(client)) return { status: 'rejected', reason: 'SNAPSHOT_FORBIDDEN' };
    const parent = this.activeSnapshot;
    const clocks = Object.fromEntries(this.authorClocks.entries());
    const snapshot = createSnapshot(
      Y.encodeStateAsUpdateV2(client.doc),
      {
        docId: DOCUMENT_ID,
        pubKey: publicKey(client),
        snapshotId,
        parentSnapshotId: parent.snapshot.publicData.snapshotId,
        parentSnapshotUpdateClocks: clocks,
      },
      this.key,
      client.signingKeys,
      hash(parent.snapshot.ciphertext, sodium),
      parent.snapshot.publicData.parentSnapshotProof,
      sodium,
    );
    if (snapshot.publicData.parentSnapshotId !== this.activeSnapshot.snapshot.publicData.snapshotId) {
      return { status: 'rejected', reason: 'CONCURRENT_SNAPSHOT_LOST_RACE' };
    }
    this.activeSnapshot = { snapshot, updateClocks: clocks };
    this.updates.length = 0;
    this.metadataLog.push(`snapshot id=${snapshotId} author=${client.id} bytes=${snapshot.ciphertext.length}`);
    return { status: 'accepted' };
  }

  completeMeeting(): void {
    this.status = 'completed';
    this.metadataLog.push('meeting completed; relay write gate closed');
  }

  bootstrapWorkspace(clientId: string, priorMeetingCount: number): string {
    const client = this.client(clientId);
    if (client.role === 'it-admin') return 'forbidden';
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    for (let index = 0; index < priorMeetingCount; index += 1) {
      const doc = new Y.Doc();
      Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(client.doc));
      doc.destroy();
    }
    const elapsed = performance.now() - started;
    const heapDelta = process.memoryUsage().heapUsed - before;
    const result = `batched ${priorMeetingCount} prior Meeting documents in ${elapsed.toFixed(1)}ms; heap delta ${(heapDelta / 1024 / 1024).toFixed(2)}MiB`;
    this.observations.unshift(result);
    return result;
  }

  runDrill(): string[] {
    const results: string[] = [];
    const note = (name: string, passed: boolean, detail: string): void => {
      results.push(`${passed ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
    };

    note('independent fragments', this.visibleFragments(this.client('alice')).length >= 5, 'one Y.Doc exposes stable Meeting and appearance fragments');
    this.setConnected('bob', false);
    this.edit('alice', 'meeting/general-notes', 'Alice while Bob is away');
    this.edit('bob', 'appearance/appearance-a/minutes', 'Bob while disconnected');
    this.reconnect('bob');
    note(
      'transient disconnect merge',
      fragmentText(this.client('alice').doc, 'appearance/appearance-a/minutes').includes('Bob while disconnected') &&
        fragmentText(this.client('bob').doc, 'meeting/general-notes').includes('Alice while Bob is away'),
      'both encrypted update streams converge after reconnect',
    );

    const dynamic = this.addAppearanceMutation('alice', 'mutation:add-dynamic', 'appearance-dynamic', 'preparation-context', 'Added mid-Meeting');
    const duplicate = this.addAppearanceMutation('alice', 'mutation:add-dynamic', 'appearance-dynamic', 'preparation-context', 'Added twice');
    note('idempotent structural + opaque mutation', dynamic.status === 'accepted' && duplicate.status === 'duplicate', `${dynamic.status}, then ${duplicate.status}`);

    const copy = this.copyForward('alice', 'appearance/appearance-person/person-note', 'appearance-copy', 'person-note');
    this.edit('alice', 'appearance/appearance-person/person-note', 'Source changed later');
    note(
      'independent copy-forward',
      copy.status === 'accepted' && fragmentText(this.client('alice').doc, 'appearance/appearance-copy/person-note').includes('Earlier person note'),
      'unlocked client copied once; later source changes did not propagate',
    );

    const recurringCopy = this.copyForward(
      'alice',
      'appearance/appearance-a/preparation-context',
      'appearance-recurring-next',
      'preparation-context',
    );
    this.edit('alice', 'appearance/appearance-a/preparation-context', 'Earlier recurrence changed later');
    note(
      'recurrence reconciliation transfer',
      recurringCopy.status === 'accepted' &&
        fragmentText(this.client('alice').doc, 'appearance/appearance-recurring-next/preparation-context').includes('Prepared context'),
      'new Recurring appearance receives an independent unlocked-client copy',
    );

    this.sendAwareness('alice', 'meeting/general-notes');
    note('encrypted non-persistent awareness', this.encryptedEphemeralRelays === 1 && this.updates.every(Boolean), 'relay logs only author and ciphertext length');

    const authorSeparation = this.verifyAuthorSeparation();
    const omission = this.detectOmittedAuthorUpdate();
    note('multi-client nonce and clock separation', authorSeparation.includes('unique nonces'), authorSeparation);
    note('omission detection', omission === 'SECSYNC_ERROR_202', omission);

    const replay = this.replayLastDelivery('bob');
    const corruption = this.corruptLastDelivery('bob');
    note('replay detection', replay === 'SECSYNC_ERROR_214', replay);
    note('corruption detection', corruption === 'SECSYNC_ERROR_212' || corruption === 'SECSYNC_ERROR_201', corruption);

    this.removeAppearance('appearance-dynamic');
    const orphanPurge = this.purgeOrphanFragment('alice', 'appearance-dynamic', 'preparation-context');
    note(
      'orphan fragment handling',
      orphanPurge.status === 'accepted' && !Object.keys(this.state().clients.alice.fragments).some((name) => name.includes('appearance-dynamic')),
      'server-readable structure hides the orphan; an unlocked client clears it before compaction',
    );

    const snapshotRace = this.raceClientSnapshots('alice', 'bob');
    note(
      'concurrent client snapshots',
      snapshotRace.startsWith('second proposal rejected'),
      snapshotRace,
    );
    note('client-created compaction', this.updates.length === 0, 'winner stored full encrypted Yjs state and replaced the update chain');

    const bootstrap = this.bootstrapWorkspace('alice', 20);
    note('batched workspace bootstrap', bootstrap.startsWith('batched 20'), bootstrap);

    this.setConnected('bob', false);
    this.edit('bob', 'appearance/appearance-a/minutes', 'Too late after completion');
    this.completeMeeting();
    this.reconnect('bob');
    note(
      'completion race',
      this.client('bob').pending.length === 0 &&
        this.client('bob').discardedAfterCompletion === 1 &&
        this.client('bob').lastError === 'PENDING_UPDATE_DISCARDED_AFTER_COMPLETION' &&
        !fragmentText(this.client('bob').doc, 'appearance/appearance-a/minutes').includes('Too late'),
      'server rejects the ciphertext; client destroys rejected plaintext state and reloads the canonical snapshot',
    );

    const forbidden = this.edit('ops', 'meeting/general-notes', 'Infrastructure must not read this');
    note('IT admin exclusion', forbidden.status === 'rejected', forbidden.reason ?? 'unexpectedly accepted');
    this.observations.unshift(...results.slice().reverse());
    return results;
  }

  state(): VisibleLabState {
    return {
      question: 'Can a Secsync-style opaque relay robustly carry ElderFlow\'s one-Yjs-document-per-Meeting boundary?',
      meeting: {
        documentId: DOCUMENT_ID,
        status: this.status,
        appearances: [...this.appearances].sort(),
      },
      relay: {
        knowsKey: false,
        activeSnapshotId: this.activeSnapshot.snapshot.publicData.snapshotId,
        persistedUpdates: this.updates.length,
        encryptedEphemeralRelays: this.encryptedEphemeralRelays,
        loggedPayloads: 0,
        metadataLog: this.metadataLog.slice(-8),
      },
      clients: Object.fromEntries([...this.clients].map(([id, client]) => [id, {
        connected: client.connected,
        pending: client.pending.length,
        discardedAfterCompletion: client.discardedAfterCompletion,
        lastError: client.lastError,
        fragments: Object.fromEntries(this.visibleFragments(client)),
      }])),
      observations: this.observations.slice(0, 14),
    };
  }

  private visibleFragments(client: Client): [string, string][] {
    return [...client.doc.share.keys()]
      .filter((name) => name.startsWith('meeting/') || name.startsWith('appearance/'))
      .filter((name) => {
        if (!name.startsWith('appearance/')) return true;
        const appearanceId = name.split('/')[1];
        return this.appearances.has(appearanceId);
      })
      .sort()
      .map((name) => [name, fragmentText(client.doc, name)]);
  }

  private client(id: string): Client {
    const client = this.clients.get(id);
    if (!client) throw new Error(`Unknown client ${id}`);
    return client;
  }
}
