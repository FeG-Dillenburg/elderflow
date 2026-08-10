// @vitest-environment jsdom
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, it } from "vitest";
import { api, type AgendaSection, type Topic, type TopicInput } from "../api/domain";
import vectors from "../../../docs/security/e2ee-v1-key-vectors.json";
import { setProtectedContentUnlocked } from "./content-visibility";
import { translate } from "../i18n";
import { bytesToBase64Url } from "./protocol";
import { base64UrlToBytes } from "./protocol";
import { SCALAR_AGGREGATES, TOPIC_SCALAR_FIELDS } from "./scalar-registry";
import { scalarSession } from "./scalar-session";
import {
  protectStandaloneUpdate,
  protectTopicInput,
  protectTopicPatch,
  unprotectTopic,
  unprotectTopicHistory,
  type EncryptedTopicResponse,
} from "./topic-scalars";

const evidenceApiUrl = process.env.E2EE_EVIDENCE_API_URL;
const evidence = evidenceApiUrl ? describe : describe.skip;
const phase = process.env.E2EE_EVIDENCE_PHASE ?? "create";
const createsFixture = phase !== "verify";
const marker = "7QX9";

evidence("Topic E2EE running instance", () => {
  let token = "";

  beforeAll(async () => {
    await sodium.ready;
    if (phase === "create") {
      const setupPassword = process.env.E2EE_EVIDENCE_SETUP_PASSWORD;
      if (!setupPassword) throw new Error("E2EE_EVIDENCE_SETUP_PASSWORD is required");
      await api.createInitialUser({
        defaultLanguage: "en",
        setupPassword,
        email: "evidence@example.com",
        firstName: "Evidence",
        lastName: "Operator",
        password: "Evidence-account-49!",
        e2ee: {
          organizationId: vectors.sharedPassphraseWrapper.organizationId,
          orkId: vectors.sharedPassphraseWrapper.orkId,
          ockId: vectors.contentKeyWrapper.ockId,
          sharedPassphraseSlot: hexToBase64Url(vectors.sharedPassphraseWrapper.envelopeHex),
          recoverySlot: hexToBase64Url(vectors.recoveryWrapper.envelopeHex),
          contentKeyWrapper: hexToBase64Url(vectors.contentKeyWrapper.envelopeHex),
          custodyCopiesAcknowledged: 2,
        },
      });
    }

    const login = await api.login({
      email: "evidence@example.com",
      password: "Evidence-account-49!",
    });
    token = login.token;
    setProtectedContentUnlocked(true);

    const signing = sodium.crypto_sign_seed_keypair(
      hexToBytes(vectors.signedNullScalar.signingSeedHex),
      "uint8array",
    );
    const noncePrefix = createsFixture
      ? hexToBytes(vectors.clientEpochNonces.firstPrefixHex)
      : hexToBytes(vectors.clientEpochNonces.secondPrefixHex);
    const clientEpochId = createsFixture
      ? "00000000-0000-4000-8000-000000000048"
      : "00000000-0000-4000-8000-000000000049";
    await jsonRequest("/api/e2ee/client-epochs", token, {
      method: "POST",
      body: JSON.stringify({
        id: clientEpochId,
        noncePrefix: bytesToBase64Url(noncePrefix),
        signingPublicKey: bytesToBase64Url(signing.publicKey),
      }),
    });
    scalarSession.unlock({
      organizationId: vectors.signedNullScalar.organizationId,
      ockId: vectors.signedNullScalar.ockId,
      clientEpochId,
      noncePrefix,
      contentKey: hexToBytes(vectors.signedNullScalar.organizationContentKeyHex),
      signingPrivateKey: signing.privateKey,
    });
  });

  it("records the exact encrypted fixture, fail-closed path, locked state, and restart read", async () => {
    if (createsFixture) {
      const sections = await jsonRequest<AgendaSection[]>("/api/agenda-sections", token);
      const sectionId = sections.find(({ name }) => name === "Urgent topics")?.id;
      expect(sectionId).toBeTruthy();

      const topics = await Promise.all([
        createTopic(token, {
          ...commonTopicInput("EF49_GENERIC_7QX9", "<p>EF49_DESC_7QX9</p>"),
          type: "generic",
          membershipProcessStatus: null,
          membershipStatusSignal: null,
          godparents: null,
          recurrenceFirstDueDate: null,
          recurrenceInterval: null,
          recurrenceUnit: null,
        }),
        createTopic(token, {
          ...commonTopicInput("EF49_PERSON_7QX9", "<p>EF49_PERSON_DESC_7QX9</p>"),
          type: "person",
          membershipProcessStatus: null,
          membershipStatusSignal: null,
          godparents: null,
          recurrenceFirstDueDate: null,
          recurrenceInterval: null,
          recurrenceUnit: null,
        }),
        createTopic(token, {
          ...commonTopicInput("EF49_MEMBER_7QX9", null),
          type: "new_membership",
          membershipProcessStatus: "EF49_PROCESS_7QX9",
          membershipStatusSignal: "in_progress",
          godparents: "EF49_GODPARENTS_7QX9",
          recurrenceFirstDueDate: null,
          recurrenceInterval: null,
          recurrenceUnit: null,
        }),
        createTopic(token, {
          ...commonTopicInput("EF49_RECURRING_7QX9", "<p>EF49_RECURRING_DESC_7QX9</p>"),
          type: "recurring",
          followUpDate: null,
          defaultSectionId: sectionId!,
          recurrenceFirstDueDate: "2026-08-17",
          recurrenceInterval: 1,
          recurrenceUnit: "weeks",
          membershipProcessStatus: null,
          membershipStatusSignal: null,
          godparents: null,
        }),
      ]);
      const generic = topics.find(({ type }) => type === "generic")!;
      const person = topics.find(({ type }) => type === "person")!;
      const updateId = crypto.randomUUID();
      await jsonRequest(`/api/topics/${generic.id}/updates`, token, {
        method: "POST",
        body: JSON.stringify({
          ...await protectStandaloneUpdate(updateId, "<p>EF49_UPDATE_7QX9</p>"),
          type: "update",
        }),
      });

      const transplanted = await protectTopicPatch(generic.id, { name: "EF49_TRANSPLANT_7QX9" });
      const transplantResponse = await fetch(`${evidenceApiUrl}/api/topics/${person.id}`, {
        method: "PUT",
        headers: requestHeaders(token),
        body: JSON.stringify(transplanted),
      });
      expect(transplantResponse.status).toBe(400);
      await expect(transplantResponse.json()).resolves.toMatchObject({
        code: "E2EE_ENVELOPE_CONTEXT_INVALID",
      });
    }

    const encryptedTopics = await jsonRequest<EncryptedTopicResponse[]>("/api/topics", token);
    await expect(scalarSession.decrypt({
      aggregateType: SCALAR_AGGREGATES.topic,
      recordId: encryptedTopics[0].id,
      fieldId: TOPIC_SCALAR_FIELDS.name.fieldId,
    }, base64UrlToBytes(encryptedTopics[0].protected!.nameEnvelope))).resolves.toContain("EF49_");
    const unlocked = await Promise.all(encryptedTopics.map((topic) => unprotectTopic(topic)));
    expect(unlocked.map(({ name }) => name).sort()).toEqual([
      "EF49_GENERIC_7QX9",
      "EF49_MEMBER_7QX9",
      "EF49_PERSON_7QX9",
      "EF49_RECURRING_7QX9",
    ]);
    const generic = unlocked.find(({ type }) => type === "generic")!;
    const encryptedHistory = await jsonRequest<Array<Record<string, unknown>>>(
      `/api/topics/${generic.id}/history`,
      token,
    );
    await expect(unprotectTopicHistory(encryptedHistory)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "standalone_update", text: "<p>EF49_UPDATE_7QX9</p>" }),
    ]));

    const rawResponse = await fetch(`${evidenceApiUrl}/api/topics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rawResponse.headers.get("cache-control")).toBe("no-store");
    const rawPayload = await rawResponse.text();
    expect(rawPayload).not.toContain(marker);

    scalarSession.lock();
    setProtectedContentUnlocked(false);
    const locked = await Promise.all(encryptedTopics.map((topic) => unprotectTopic(topic)));
    expect(locked).toHaveLength(4);
    expect(locked.every(({ name }) => name === translate("e2ee.lockedPlaceholder"))).toBe(true);
    expect(JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    })).not.toContain(marker);
  });
});

function commonTopicInput(name: string, description: string | null) {
  return {
    name,
    description,
    status: "open",
    followUpDate: null,
    responsibleUserId: null,
    defaultSectionId: null,
    defaultPosition: null,
  };
}

function requestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Elderflow-E2EE-Unlocked": "1",
  };
}

async function createTopic(token: string, input: TopicInput): Promise<Topic> {
  const id = crypto.randomUUID();
  const response = await jsonRequest<EncryptedTopicResponse>("/api/topics", token, {
    method: "POST",
    body: JSON.stringify(await protectTopicInput(id, input)),
  });
  return unprotectTopic(response);
}

async function jsonRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${evidenceApiUrl}${path}`, {
    ...init,
    headers: {
      ...requestHeaders(token),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Evidence request ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function hexToBase64Url(value: string): string {
  return bytesToBase64Url(hexToBytes(value));
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}
