// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../../../docs/security/e2ee-v1-key-vectors.json";
import { api } from "../api/domain";
import { getSessionToken, setSessionToken } from "../auth/session";
import {
  createKeyCeremonyCandidate,
  derivePassphraseKeyInCurrentContext,
  unlockWithPassphrase,
  verifyKeyCeremonyCandidate,
} from "./crypto";
import {
  protectMeetingTitle,
  unprotectMeetingTitle,
  type EncryptedMeetingTitle,
} from "./meeting-scalars";
import {
  MeetingDocumentSession,
  type EncryptedWorkspace,
} from "./meeting-document-session";
import { meetingFragmentId } from "./meeting-document-codec";
import { bytesToBase64Url, E2EE_MEDIA_TYPE } from "./protocol";
import { scalarSession } from "./scalar-session";

const evidenceApiUrl = process.env.E2EE_EVIDENCE_API_URL;
const evidence = evidenceApiUrl ? describe : describe.skip;
const phase = process.env.E2EE_EVIDENCE_PHASE ?? "create";
const marker = "EF54_";
const meetingId = "00000000-0000-4000-8000-000000000054";
const appearanceId = "00000000-0000-4000-8000-000000000154";
const mutationId = "00000000-0000-4000-8000-000000000254";
const guestEmail = "evidence-guest-54@example.com";
const itAdminEmail = "evidence-it-admin-54@example.com";
const approverEmail = "evidence-approver-54@example.com";
const evidencePassword = "Evidence-account-54!";
const encoder = new Encoder({
  mapsAsObjects: false,
  structuredClone: false,
  tagUint8Array: false,
  useRecords: false,
});
const clientSpecs = {
  a: {
    epochId: "00000000-0000-4000-8000-000000000954",
    noncePrefix: new Uint8Array(16).fill(59),
    signingSeed: new Uint8Array(32).fill(59),
  },
  b: {
    epochId: "00000000-0000-4000-8000-000000001054",
    noncePrefix: new Uint8Array(16).fill(60),
    signingSeed: new Uint8Array(32).fill(60),
  },
  verify: {
    epochId: "00000000-0000-4000-8000-000000001154",
    noncePrefix: new Uint8Array(16).fill(61),
    signingSeed: new Uint8Array(32).fill(61),
  },
  ceremony: {
    epochId: "00000000-0000-4000-8000-000000001254",
    noncePrefix: new Uint8Array(16).fill(62),
    signingSeed: new Uint8Array(32).fill(62),
  },
};

evidence("E2EE release running instance", () => {
  let token = "";
  let userId = "";

  beforeAll(async () => {
    await sodium.ready;
    installEvidenceStorage();
    const login = await api.login({
      email: "evidence@example.com",
      password: "Evidence-account-49!",
    });
    token = login.token;
    userId = login.user.id;
    setSessionToken(token);
  });

  it("proves cross-client convergence, restart recovery, and the completed-Meeting boundary", async () => {
    if (phase === "create") {
      await createEvidenceFixture(token, userId);
      return;
    }
    if (phase === "ceremony") {
      const completedWorkspace = await rawRequest(
        `/api/meetings/${meetingId}/workspace`,
        token,
      );
      await runRootRotationCeremony(completedWorkspace);
      return;
    }

    const client = await createClient("verify", token);
    unlockScalar(client);
    const rawMeeting = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}`, {
      headers: authorization(token),
    });
    expect(rawMeeting.headers.get("cache-control")).toBe("no-store");
    const rawMeetingText = await rawMeeting.text();
    expect(rawMeetingText).not.toContain(marker);
    const encryptedMeeting = JSON.parse(rawMeetingText) as EncryptedMeetingTitle;
    await expect(unprotectMeetingTitle(meetingId, encryptedMeeting.protected))
      .resolves.toBe("EF54_SCALAR_7QX9");

    const rawWorkspace = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}/workspace`, {
      headers: authorization(token),
    });
    expect(rawWorkspace.headers.get("cache-control")).toBe("no-store");
    const rawWorkspaceText = await rawWorkspace.text();
    expect(rawWorkspaceText).not.toContain(marker);
    const workspace = JSON.parse(rawWorkspaceText) as EncryptedWorkspace;
    await client.session.load(meetingId, workspace);

    const fragments = client.session.hydrateFragments(meetingId, [{ id: appearanceId, person: false }]);
    expect(fragments.generalNotes).toBe("EF54_COLLAB_7QX9_A_RECONNECTED");
    expect(fragments.openingInput).toBe("EF54_COLLAB_7QX9_OFFLINE_B");
    expect(fragments.appearances.get(appearanceId)?.preparationContext)
      .toBe("EF54_COLLAB_7QX9_B");

    await verifyAccessBoundaries(token, encryptedMeeting);
    unlockScalar(client);

    const socket = await openCollaboration(token, workspace.documentId);
    const lateEnvelope = await client.session.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "EF54_COLLAB_7QX9_LATE_REJECTED",
    );
    const completion = await jsonRequest(`/api/meetings/${meetingId}/complete`, token, {
      method: "POST",
    });
    expect(JSON.stringify(completion)).not.toContain(marker);
    const completedWorkspace = await rawRequest(`/api/meetings/${meetingId}/workspace`, token);
    socket.send({ type: "update", envelope: lateEnvelope });
    await expect(socket.next("rejected"))
      .resolves.toMatchObject({ code: "MEETING_COMPLETED_IMMUTABLE" });
    const frozenReload = await rawRequest(`/api/meetings/${meetingId}/workspace`, token);
    expect(frozenReload).toBe(completedWorkspace);
    expect(socket.transcript).not.toContain(marker);
    socket.close();

    expect(webStorageText()).not.toContain(marker);
    expect(window.location.href).not.toContain(marker);
    expect(evidenceArtifactText()).not.toContain(marker);
    client.session.lock();
    scalarSession.lock();
    await expect(unprotectMeetingTitle(meetingId, encryptedMeeting.protected))
      .resolves.not.toContain(marker);

  });
});

async function createEvidenceFixture(token: string, userId: string): Promise<void> {
  await Promise.all([
    createBoundaryUser(token, guestEmail, "guest"),
    createBoundaryUser(token, itAdminEmail, "it-admin"),
    createBoundaryUser(token, approverEmail, "admin"),
  ]);
  const [clientA, clientB] = await Promise.all([
    createClient("a", token),
    createClient("b", token),
  ]);
  unlockScalar(clientA);

  const initial = await clientA.session.createInitial(meetingId);
  const createBody = Uint8Array.from(encoder.encode([
    meetingId,
    base64UrlToBytes(await protectMeetingTitle(meetingId, "EF54_SCALAR_7QX9")),
    initial.documentId,
    initial.snapshotId,
    base64UrlToBytes(initial.snapshotEnvelope),
    "2026-08-25",
    "19:30",
    "in_progress",
    userId,
    userId,
  ]));
  const created = await binaryRequest("/api/meetings", token, createBody);
  expect(JSON.stringify(created)).not.toContain(marker);

  const [topics, sections] = await Promise.all([
    jsonRequest<Array<{ id: string; type: string }>>("/api/topics", token),
    jsonRequest<Array<{ id: string; name: string }>>("/api/agenda-sections", token),
  ]);
  const topicId = topics.find(({ type }) => type === "generic")?.id;
  const sectionId = sections.find(({ name }) => name === "Urgent topics")?.id;
  expect(topicId).toBeTruthy();
  expect(sectionId).toBeTruthy();

  const initialAppearanceEnvelope = await clientA.session.createFragmentUpdate(
    meetingId,
    meetingFragmentId("preparationContext", appearanceId),
    "",
  );
  const mutation = Uint8Array.from(encoder.encode([
    appearanceId,
    mutationId,
    topicId,
    sectionId,
    base64UrlToBytes(initialAppearanceEnvelope),
    "manual",
    true,
    null,
    false,
    null,
    false,
    null,
    false,
  ]));
  await binaryRequest(`/api/meetings/${meetingId}/topics`, token, mutation);

  const workspace = await jsonRequest<EncryptedWorkspace>(
    `/api/meetings/${meetingId}/workspace`,
    token,
  );
  await Promise.all([
    clientA.session.load(meetingId, workspace),
    clientB.session.load(meetingId, workspace),
  ]);
  const [socketA, socketB] = await Promise.all([
    openCollaboration(token, workspace.documentId),
    openCollaboration(token, workspace.documentId),
  ]);

  const [envelopeA, envelopeB] = await Promise.all([
    clientA.session.createFragmentUpdate(
      meetingId,
      "meeting/general-notes",
      "EF54_COLLAB_7QX9_A",
    ),
    clientB.session.createFragmentUpdate(
      meetingId,
      meetingFragmentId("preparationContext", appearanceId),
      "EF54_COLLAB_7QX9_B",
    ),
  ]);
  socketA.send({ type: "update", envelope: envelopeA });
  socketB.send({ type: "update", envelope: envelopeB });
  const [ackA, ackB, remoteForA, remoteForB] = await Promise.all([
    socketA.next("acknowledged"),
    socketB.next("acknowledged"),
    socketA.next("update"),
    socketB.next("update"),
  ]);
  clientA.session.acknowledge(
    meetingId,
    ackA.clientEpochId,
    ackA.authorClock,
    ackA.serverSequence,
  );
  clientB.session.acknowledge(
    meetingId,
    ackB.clientEpochId,
    ackB.authorClock,
    ackB.serverSequence,
  );
  await Promise.all([
    clientA.session.applyRemoteUpdate(meetingId, remoteFrame(remoteForA), "remote"),
    clientB.session.applyRemoteUpdate(meetingId, remoteFrame(remoteForB), "remote"),
  ]);
  const concurrentWorkspace = await jsonRequest<EncryptedWorkspace>(
    `/api/meetings/${meetingId}/workspace`,
    token,
  );
  await Promise.all([
    clientA.session.load(meetingId, concurrentWorkspace),
    clientB.session.load(meetingId, concurrentWorkspace),
  ]);
  expect(clientA.session.hydrateFragments(meetingId, [{ id: appearanceId, person: false }]))
    .toEqual(clientB.session.hydrateFragments(meetingId, [{ id: appearanceId, person: false }]));

  socketB.close();
  const offlineEnvelope = await clientB.session.createFragmentUpdate(
    meetingId,
    "meeting/opening-input",
    "EF54_COLLAB_7QX9_OFFLINE_B",
  );
  const reconnectEnvelope = await clientA.session.createFragmentUpdate(
    meetingId,
    "meeting/general-notes",
    "EF54_COLLAB_7QX9_A_RECONNECTED",
  );
  socketA.send({ type: "update", envelope: reconnectEnvelope });
  const reconnectAck = await socketA.next("acknowledged");
  clientA.session.acknowledge(
    meetingId,
    String(reconnectAck.clientEpochId),
    String(reconnectAck.authorClock),
    String(reconnectAck.serverSequence),
  );

  const reconnectedB = await openCollaboration(token, workspace.documentId);
  reconnectedB.send({ type: "update", envelope: offlineEnvelope });
  const offlineAck = await reconnectedB.next("acknowledged");
  clientB.session.acknowledge(
    meetingId,
    offlineAck.clientEpochId,
    offlineAck.authorClock,
    offlineAck.serverSequence,
  );

  const convergedWorkspace = await jsonRequest<EncryptedWorkspace>(
    `/api/meetings/${meetingId}/workspace`,
    token,
  );
  await Promise.all([
    clientA.session.load(meetingId, convergedWorkspace),
    clientB.session.load(meetingId, convergedWorkspace),
  ]);
  const fragmentsA = clientA.session.hydrateFragments(
    meetingId,
    [{ id: appearanceId, person: false }],
  );
  const fragmentsB = clientB.session.hydrateFragments(
    meetingId,
    [{ id: appearanceId, person: false }],
  );
  expect(fragmentsA).toEqual(fragmentsB);
  expect(fragmentsA).toMatchObject({
    generalNotes: "EF54_COLLAB_7QX9_A_RECONNECTED",
    openingInput: "EF54_COLLAB_7QX9_OFFLINE_B",
  });
  expect(fragmentsA.appearances.get(appearanceId)?.preparationContext)
    .toBe("EF54_COLLAB_7QX9_B");

  const rawMeeting = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}`, {
    headers: authorization(token),
  });
  expect(rawMeeting.headers.get("cache-control")).toBe("no-store");
  expect(await rawMeeting.text()).not.toContain(marker);
  expect(socketA.transcript).not.toContain(marker);
  expect(socketB.transcript).not.toContain(marker);
  expect(reconnectedB.transcript).not.toContain(marker);
  expect(webStorageText()).not.toContain(marker);
  expect(window.location.href).not.toContain(marker);

  socketA.close();
  reconnectedB.close();
  clientA.session.lock();
  clientB.session.lock();
  scalarSession.lock();
}

async function createBoundaryUser(
  token: string,
  email: string,
  role: "guest" | "it-admin" | "admin",
): Promise<void> {
  await jsonRequest("/api/user", token, {
    method: "POST",
    body: JSON.stringify({
      email,
      firstName: "Evidence",
      lastName: role === "guest"
        ? "Guest"
        : role === "it-admin"
          ? "IT Admin"
          : "Approver",
      role,
      password: evidencePassword,
    }),
  });
}

async function runRootRotationCeremony(
  completedWorkspace: string,
): Promise<void> {
  const initiator = await api.login({
    email: "evidence@example.com",
    password: "Evidence-account-49!",
  });
  const initiatorToken = initiator.token;
  setSessionToken(initiatorToken);
  expect(getSessionToken()).toBe(initiatorToken);
  const initialState = await api.e2eeRecoveryMetadata();
  const candidate = await createKeyCeremonyCandidate({
    operation: "rotate_root_key",
    reasonCode: "planned_root_rotation",
    state: initialState,
    currentPassphrase: vectors.sharedPassphraseWrapper.passphraseUtf8,
    currentRecoveryText: vectors.recoveryWrapper.recoveryText,
    newPassphrase: vectors.sharedPassphraseWrapper.passphraseUtf8,
  }, undefined, derivePassphraseKeyInCurrentContext);
  const started = await api.startE2eeKeyCeremony(candidate.encodedCandidate);
  await api.confirmE2eeKeyCeremonyPresence(started.id);

  const approver = await api.login({ email: approverEmail, password: evidencePassword });
  setSessionToken(approver.token);
  const [approverState, ceremony] = await Promise.all([
    api.e2eeRecoveryMetadata(),
    api.e2eeKeyCeremony(started.id),
  ]);
  await expect(verifyKeyCeremonyCandidate(
    ceremony.encodedCandidate,
    ceremony.candidateFingerprint,
    approverState,
    {
      currentPassphrase: vectors.sharedPassphraseWrapper.passphraseUtf8,
      currentRecoveryText: vectors.recoveryWrapper.recoveryText,
      candidatePassphrase: vectors.sharedPassphraseWrapper.passphraseUtf8,
      candidateRecoveryText: vectors.recoveryWrapper.recoveryText,
    },
    undefined,
    derivePassphraseKeyInCurrentContext,
  )).resolves.toBe(true);
  await api.approveE2eeKeyCeremony(started.id, ceremony.candidateFingerprint);
  await api.confirmE2eeKeyCeremonyPresence(started.id);
  await expect(api.activateE2eeKeyCeremony(started.id)).resolves.toEqual({
    activated: true,
    generation: initialState.generation + 1,
  });

  const revokedSession = await fetch(`${evidenceApiUrl}/api/auth/me`, {
    headers: authorization(initiatorToken),
  });
  expect([401, 403]).toContain(revokedSession.status);
  expect(await revokedSession.text()).not.toContain(marker);

  const freshLogin = await api.login({
    email: "evidence@example.com",
    password: "Evidence-account-49!",
  });
  setSessionToken(freshLogin.token);
  const rotatedState = await api.e2eeRecoveryMetadata();
  expect(rotatedState).toMatchObject({
    generation: initialState.generation + 1,
    orkId: candidate.payload.orkId,
    ockId: initialState.ockId,
  });

  const unlocked = await unlockWithPassphrase(
    vectors.sharedPassphraseWrapper.passphraseUtf8,
    rotatedState,
    undefined,
    derivePassphraseKeyInCurrentContext,
  );
  try {
    expect(bytesToHex(unlocked.contentKey))
      .toBe(vectors.signedNullScalar.organizationContentKeyHex);
    const ceremonyClient = await createClientWithContentKey(
      "ceremony",
      freshLogin.token,
      unlocked.contentKey,
    );
    unlockScalar(ceremonyClient);
    const encryptedMeeting = JSON.parse(
      await rawRequest(`/api/meetings/${meetingId}`, freshLogin.token),
    ) as EncryptedMeetingTitle;
    await expect(unprotectMeetingTitle(meetingId, encryptedMeeting.protected))
      .resolves.toBe("EF54_SCALAR_7QX9");
    const workspace = JSON.parse(
      await rawRequest(`/api/meetings/${meetingId}/workspace`, freshLogin.token),
    ) as EncryptedWorkspace;
    await ceremonyClient.session.load(meetingId, workspace);
    expect(ceremonyClient.session.hydrateFragments(
      meetingId,
      [{ id: appearanceId, person: false }],
    )).toMatchObject({
      generalNotes: "EF54_COLLAB_7QX9_A_RECONNECTED",
      openingInput: "EF54_COLLAB_7QX9_OFFLINE_B",
    });
    expect(JSON.stringify(workspace)).toBe(completedWorkspace);
    ceremonyClient.session.lock();
    scalarSession.lock();
  } finally {
    sodium.memzero(unlocked.organizationRootKey);
    sodium.memzero(unlocked.contentKey);
    unlocked.historicalContentKeys.forEach((key) => sodium.memzero(key));
  }
}

async function verifyAccessBoundaries(
  token: string,
  encryptedMeeting: EncryptedMeetingTitle,
): Promise<void> {
  scalarSession.lock();
  await expect(unprotectMeetingTitle(meetingId, encryptedMeeting.protected))
    .resolves.not.toContain(marker);

  const [guest, itAdmin] = await Promise.all([
    api.login({ email: guestEmail, password: evidencePassword }),
    api.login({ email: itAdminEmail, password: evidencePassword }),
  ]);
  const guestResponse = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}`, {
    headers: authorization(guest.token),
  });
  expect(guestResponse.status).toBe(200);
  const guestText = await guestResponse.text();
  expect(guestText).not.toContain(marker);
  expect(JSON.parse(guestText)).toMatchObject({ protected: null });

  for (const restrictedToken of [itAdmin.token, "not-a-session-token"]) {
    const response = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}/workspace`, {
      headers: authorization(restrictedToken),
    });
    expect([401, 403]).toContain(response.status);
    expect(await response.text()).not.toContain(marker);
  }

  setSessionToken(token);
}

type ClientName = keyof typeof clientSpecs;

async function createClient(name: ClientName, token: string) {
  return createClientWithContentKey(
    name,
    token,
    hexToBytes(vectors.signedNullScalar.organizationContentKeyHex),
  );
}

async function createClientWithContentKey(
  name: ClientName,
  token: string,
  contentKey: Uint8Array,
) {
  const spec = clientSpecs[name];
  const signing = sodium.crypto_sign_seed_keypair(spec.signingSeed, "uint8array");
  await jsonRequest("/api/e2ee/client-epochs", token, {
    method: "POST",
    body: JSON.stringify({
      id: spec.epochId,
      noncePrefix: bytesToBase64Url(spec.noncePrefix),
      signingPublicKey: bytesToBase64Url(signing.publicKey),
    }),
  });
  const session = new MeetingDocumentSession();
  session.unlock({
    organizationId: vectors.signedNullScalar.organizationId,
    ockId: vectors.signedNullScalar.ockId,
    clientEpochId: spec.epochId,
    noncePrefix: spec.noncePrefix,
    contentKey,
    signingPrivateKey: signing.privateKey,
  });
  return { session, signing, spec };
}

function unlockScalar(client: Awaited<ReturnType<typeof createClient>>): void {
  scalarSession.unlock({
    organizationId: vectors.signedNullScalar.organizationId,
    ockId: vectors.signedNullScalar.ockId,
    clientEpochId: client.spec.epochId,
    noncePrefix: client.spec.noncePrefix,
    contentKey: hexToBytes(vectors.signedNullScalar.organizationContentKeyHex),
    signingPrivateKey: client.signing.privateKey,
  });
}

type AuthenticatedFrame = { type: "authenticated"; documentId: string };
type UpdateFrameBase = {
  updateId: string;
  clientEpochId: string;
  authorClock: string;
  serverSequence: string;
  signingPublicKey: string;
  envelope: string;
};
type UpdateFrame = UpdateFrameBase & { type: "update" };
type AcknowledgedFrame = UpdateFrameBase & { type: "acknowledged" };
type RejectedFrame = { type: "rejected"; code: string };
type ParentChangedFrame = { type: "parent-changed" };
type ServerFrame =
  | AuthenticatedFrame
  | UpdateFrame
  | AcknowledgedFrame
  | RejectedFrame
  | ParentChangedFrame;
type ClientFrame =
  | { type: "authenticate"; ticket: string; documentId: string }
  | { type: "update"; envelope: string };

class SocketEvidence {
  readonly frames: ServerFrame[] = [];
  readonly sent: string[] = [];
  readonly received: string[] = [];
  private readonly waiters: Array<{
    predicate: (frame: ServerFrame) => boolean;
    resolve: (frame: ServerFrame) => void;
    timer: number;
  }> = [];

  constructor(readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const encoded = String(event.data);
      this.received.push(encoded);
      const frame = parseServerFrame(encoded);
      const waiterIndex = this.waiters.findIndex(({ predicate }) => predicate(frame));
      if (waiterIndex < 0) {
        this.frames.push(frame);
        return;
      }
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      window.clearTimeout(waiter.timer);
      waiter.resolve(frame);
    });
  }

  get transcript(): string {
    return [...this.sent, ...this.received].join("\n");
  }

  send(frame: ClientFrame): void {
    const encoded = JSON.stringify(frame);
    this.sent.push(encoded);
    this.socket.send(encoded);
  }

  async next<T extends ServerFrame["type"]>(
    type: T,
    timeoutMs = 5_000,
  ): Promise<Extract<ServerFrame, { type: T }>> {
    const predicate = (frame: ServerFrame) => frame.type === type;
    const existing = this.frames.find(predicate);
    if (existing) {
      this.frames.splice(this.frames.indexOf(existing), 1);
      return existing as Extract<ServerFrame, { type: T }>;
    }
    return new Promise<ServerFrame>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const waiterIndex = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
        reject(new Error("Timed out waiting for collaboration frame"));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, timer });
    }) as Promise<Extract<ServerFrame, { type: T }>>;
  }

  close(): void {
    this.socket.close();
  }
}

function parseServerFrame(encoded: string): ServerFrame {
  const value = JSON.parse(encoded) as unknown;
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Invalid collaboration evidence frame");
  }
  const frame = value as Record<string, unknown>;
  if (frame.type === "parent-changed") return { type: "parent-changed" };
  if (frame.type === "authenticated") {
    return { type: "authenticated", documentId: requiredString(frame, "documentId") };
  }
  if (frame.type === "rejected") {
    return { type: "rejected", code: requiredString(frame, "code") };
  }
  if (frame.type === "update" || frame.type === "acknowledged") {
    return {
      type: frame.type,
      updateId: requiredString(frame, "updateId"),
      clientEpochId: requiredString(frame, "clientEpochId"),
      authorClock: requiredString(frame, "authorClock"),
      serverSequence: requiredString(frame, "serverSequence"),
      signingPublicKey: requiredString(frame, "signingPublicKey"),
      envelope: requiredString(frame, "envelope"),
    };
  }
  throw new Error(`Unexpected collaboration evidence frame: ${String(frame.type)}`);
}

function requiredString(frame: Record<string, unknown>, field: string): string {
  const value = frame[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid collaboration evidence frame field: ${field}`);
  }
  return value;
}

async function openCollaboration(token: string, documentId: string): Promise<SocketEvidence> {
  const ticket = await jsonRequest<{
    ticket: string;
    documentId: string;
    websocketPath: string;
  }>(`/api/meetings/${meetingId}/collaboration-ticket`, token, { method: "POST" });
  expect(ticket.documentId).toBe(documentId);
  const url = new URL(ticket.websocketPath, evidenceApiUrl);
  url.protocol = "ws:";
  const socket = new WebSocket(url);
  const evidenceSocket = new SocketEvidence(socket);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Collaboration socket failed")), {
      once: true,
    });
  });
  evidenceSocket.send({ type: "authenticate", ticket: ticket.ticket, documentId });
  await evidenceSocket.next("authenticated");
  return evidenceSocket;
}

function remoteFrame(frame: ServerFrame) {
  if (frame.type !== "update") throw new Error("Expected collaboration update frame");
  return {
    clientEpochId: frame.clientEpochId,
    authorClock: frame.authorClock,
    signingPublicKey: frame.signingPublicKey,
    envelope: frame.envelope,
    serverSequence: frame.serverSequence,
  };
}

async function rawRequest(path: string, token: string): Promise<string> {
  const response = await fetch(`${evidenceApiUrl}${path}`, { headers: authorization(token) });
  expect(response.ok).toBe(true);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const text = await response.text();
  expect(text).not.toContain(marker);
  return text;
}

async function binaryRequest(path: string, token: string, body: Uint8Array): Promise<unknown> {
  const response = await fetch(`${evidenceApiUrl}${path}`, {
    method: "POST",
    headers: {
      ...authorization(token),
      "Content-Type": E2EE_MEDIA_TYPE,
    },
    body: Uint8Array.from(body).buffer as ArrayBuffer,
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function jsonRequest<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${evidenceApiUrl}${path}`, {
    ...init,
    headers: {
      ...authorization(token),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function bytesToHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function installEvidenceStorage(): void {
  const probe = "elderflow:evidence-storage-probe";
  try {
    window.localStorage.setItem(probe, "ok");
    window.localStorage.removeItem(probe);
    return;
  } catch {
    // The jsdom evidence runner may expose an unusable opaque-origin Storage object.
  }
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, String(value)),
  };
}

function webStorageText(): string {
  return JSON.stringify([
    { localStorage: { ...localStorage } },
    { sessionStorage: { ...sessionStorage } },
  ]);
}

function evidenceArtifactText(): string {
  const dumpPath = process.env.E2EE_EVIDENCE_DATABASE_DUMP;
  const logPath = process.env.E2EE_EVIDENCE_BACKEND_LOG;
  if (!dumpPath || !logPath) {
    throw new Error(
      "E2EE_EVIDENCE_DATABASE_DUMP and E2EE_EVIDENCE_BACKEND_LOG are required for verify",
    );
  }
  return `${readFileSync(dumpPath, "utf8")}\n${readFileSync(logPath, "utf8")}`;
}
