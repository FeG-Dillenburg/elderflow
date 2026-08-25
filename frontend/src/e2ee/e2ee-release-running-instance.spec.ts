// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Encoder } from "cbor-x";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../../../docs/security/e2ee-v1-key-vectors.json";
import { api } from "../api/domain";
import { setSessionToken } from "../auth/session";
import { protectMeetingTitle } from "./meeting-scalars";
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
};

evidence("E2EE release running instance", () => {
  let token = "";
  let userId = "";

  beforeAll(async () => {
    await sodium.ready;
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

    const client = await createClient("verify", token);
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
    socket.send({ type: "update", envelope: lateEnvelope });
    await expect(socket.next((frame) => frame.type === "rejected"))
      .resolves.toMatchObject({ code: "MEETING_COMPLETED_IMMUTABLE" });
    expect(socket.sentText).not.toContain(marker);
    socket.close();

    expect(await browserPersistenceText()).not.toContain(marker);
    client.session.lock();
    scalarSession.lock();
  });
});

async function createEvidenceFixture(token: string, userId: string): Promise<void> {
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
    socketA.next((frame) => frame.type === "acknowledged"),
    socketB.next((frame) => frame.type === "acknowledged"),
    socketA.next((frame) => frame.type === "update"),
    socketB.next((frame) => frame.type === "update"),
  ]);
  clientA.session.acknowledge(meetingId, String(ackA.clientEpochId), String(ackA.authorClock), String(ackA.serverSequence));
  clientB.session.acknowledge(meetingId, String(ackB.clientEpochId), String(ackB.authorClock), String(ackB.serverSequence));
  await Promise.all([
    clientA.session.applyRemoteUpdate(meetingId, remoteFrame(remoteForA), "remote"),
    clientB.session.applyRemoteUpdate(meetingId, remoteFrame(remoteForB), "remote"),
  ]);

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
  const reconnectAck = await socketA.next((frame) => frame.type === "acknowledged");
  clientA.session.acknowledge(
    meetingId,
    String(reconnectAck.clientEpochId),
    String(reconnectAck.authorClock),
    String(reconnectAck.serverSequence),
  );

  const reconnectedB = await openCollaboration(token, workspace.documentId);
  reconnectedB.send({ type: "update", envelope: offlineEnvelope });
  await reconnectedB.next((frame) => frame.type === "acknowledged");

  const rawMeeting = await fetch(`${evidenceApiUrl}/api/meetings/${meetingId}`, {
    headers: authorization(token),
  });
  expect(rawMeeting.headers.get("cache-control")).toBe("no-store");
  expect(await rawMeeting.text()).not.toContain(marker);
  expect(socketA.sentText).not.toContain(marker);
  expect(socketB.sentText).not.toContain(marker);
  expect(reconnectedB.sentText).not.toContain(marker);
  expect(await browserPersistenceText()).not.toContain(marker);

  socketA.close();
  reconnectedB.close();
  clientA.session.lock();
  clientB.session.lock();
  scalarSession.lock();
}

type ClientName = keyof typeof clientSpecs;

async function createClient(name: ClientName, token: string) {
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
    contentKey: hexToBytes(vectors.signedNullScalar.organizationContentKeyHex),
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

class SocketEvidence {
  readonly frames: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  constructor(readonly socket: WebSocket) {}

  get sentText(): string {
    return this.sent.join("\n");
  }

  send(frame: Record<string, unknown>): void {
    const encoded = JSON.stringify(frame);
    this.sent.push(encoded);
    this.socket.send(encoded);
  }

  async next(
    predicate: (frame: Record<string, unknown>) => boolean,
    timeoutMs = 5_000,
  ): Promise<Record<string, unknown>> {
    const existing = this.frames.find(predicate);
    if (existing) {
      this.frames.splice(this.frames.indexOf(existing), 1);
      return existing;
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.socket.removeEventListener("message", listener);
        reject(new Error("Timed out waiting for collaboration frame"));
      }, timeoutMs);
      const listener = (event: MessageEvent) => {
        const frame = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (!predicate(frame)) return;
        window.clearTimeout(timer);
        this.socket.removeEventListener("message", listener);
        resolve(frame);
      };
      this.socket.addEventListener("message", listener);
    });
  }

  close(): void {
    this.socket.close();
  }
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
  socket.addEventListener("message", (event) => {
    evidenceSocket.frames.push(JSON.parse(String(event.data)) as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Collaboration socket failed")), {
      once: true,
    });
  });
  evidenceSocket.send({ type: "authenticate", ticket: ticket.ticket, documentId });
  await evidenceSocket.next((frame) => frame.type === "authenticated");
  return evidenceSocket;
}

function remoteFrame(frame: Record<string, unknown>) {
  return {
    clientEpochId: String(frame.clientEpochId),
    authorClock: String(frame.authorClock),
    signingPublicKey: String(frame.signingPublicKey),
    envelope: String(frame.envelope),
    serverSequence: String(frame.serverSequence),
  };
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

async function browserPersistenceText(): Promise<string> {
  const inspected: unknown[] = [
    { localStorage: { ...localStorage } },
    { sessionStorage: { ...sessionStorage } },
  ];
  if ("caches" in globalThis) {
    for (const cacheName of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(cacheName);
      for (const response of await cache.matchAll()) inspected.push(await response.text());
    }
  } else {
    expect(productionBrowserPersistenceSource()).not.toMatch(/\b(?:caches|CacheStorage)\b/);
  }
  if ("indexedDB" in globalThis && typeof globalThis.indexedDB.databases === "function") {
    const databases = await globalThis.indexedDB.databases();
    inspected.push(databases.map(({ name, version }) => ({ name, version })));
  } else {
    expect(productionBrowserPersistenceSource()).not.toMatch(/\bindexedDB\b/);
  }
  return JSON.stringify(inspected);
}

function productionBrowserPersistenceSource(directory = join(process.cwd(), "src")): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return productionBrowserPersistenceSource(path);
      if (!/\.(?:ts|vue)$/.test(entry.name) || entry.name.endsWith(".spec.ts")) return [];
      return [readFileSync(path, "utf8")];
    })
    .join("\n");
}
